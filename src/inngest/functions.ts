import OpenAI from "openai";
import { inngest } from "@/lib/inngest";
import { getRun, updateRun } from "@/lib/run-store";
import type { WorkflowGraph } from "@/lib/workflow";

type WorkflowEvent = {
  runId: string;
  graph: WorkflowGraph;
  input: string;
};

type Decision = "YES" | "NO";

async function askDecision(prompt: string, input: string): Promise<Decision> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured. Add it to .env.local and restart the app.");
  }

  const openai = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
      "X-OpenRouter-Title": process.env.OPENROUTER_SITE_NAME ?? "FlyRank BE-09 AI Decision Flow",
    },
  });
  const completion = await openai.chat.completions.create({
    model: process.env.OPENROUTER_MODEL ?? "openrouter/free",
    messages: [
      {
        role: "system",
        content: "Evaluate the decision question against the supplied message. Reply with exactly YES or NO and no other text.",
      },
      {
        role: "user",
        content: `Decision question: ${prompt}\n\nMessage to evaluate: ${input}`,
      },
    ],
  });

  const content = completion.choices[0]?.message.content;
  if (!content) {
    throw new Error("The AI returned an empty decision.");
  }

  const result = content.trim();
  if (result !== "YES" && result !== "NO") {
    throw new Error(`The AI must return exactly YES or NO. Received: ${result.slice(0, 120)}`);
  }

  return result;
}

export const executeWorkflow = inngest.createFunction(
  {
    id: "execute-ai-decision-flow",
    retries: 0,
    triggers: [{ event: "workflow/run.requested" }],
  },
  async ({ event, step }) => {
    const { runId, graph, input } = event.data as WorkflowEvent;
    const run = getRun(runId);
    if (!run) {
      throw new Error(`Workflow run ${runId} was not found.`);
    }

    const visited = new Set<string>();
    let currentNodeId = graph.startNodeId;
    updateRun(runId, (current) => {
      current.status = "running";
    });

    try {
      while (currentNodeId) {
        if (visited.has(currentNodeId)) {
          throw new Error("This workflow contains a loop. Remove the cycle before running it.");
        }
        visited.add(currentNodeId);

        const node = graph.nodes.find(({ id }) => id === currentNodeId);
        if (!node) {
          throw new Error(`Node "${currentNodeId}" could not be found.`);
        }

        if (node.type === "outcome") {
          await step.run(`outcome-${node.id}`, () => ({
            title: node.data.title,
            description: node.data.description,
          }));
          updateRun(runId, (current) => {
            current.activeNodeId = undefined;
            current.status = "completed";
            const log = current.logs.find((entry) => entry.nodeId === node.id);
            if (log) {
              log.status = "completed";
              log.message = node.data.description || "Workflow reached this outcome.";
            } else {
              current.logs.push({
                id: crypto.randomUUID(),
                nodeId: node.id,
                nodeTitle: node.data.title,
                status: "completed",
                message: node.data.description || "Workflow reached this outcome.",
                createdAt: new Date().toISOString(),
              });
            }
          });
          return { runId, outcome: node.data.title };
        }

        updateRun(runId, (current) => {
          current.activeNodeId = node.id;
          const log = current.logs.find((entry) => entry.nodeId === node.id);
          if (log) {
            log.status = "running";
            log.message = "Evaluating decision…";
          } else {
            current.logs.push({
              id: crypto.randomUUID(),
              nodeId: node.id,
              nodeTitle: node.data.title,
              status: "running",
              message: "Evaluating decision…",
              createdAt: new Date().toISOString(),
            });
          }
        });

        const result = await step.run(`decision-${node.id}`, () =>
          askDecision(node.data.prompt, input),
        );
        const selectedEdge = graph.edges.find(
          (edge) => edge.source === node.id && edge.sourceHandle === result.toLowerCase(),
        );

        updateRun(runId, (current) => {
          const log = current.logs.find((entry) => entry.nodeId === node.id);
          if (log) {
            log.status = "completed";
            log.result = result;
            log.message = `AI returned ${result}; following the ${result} branch.`;
          }
          current.activeNodeId = undefined;
        });

        currentNodeId = selectedEdge?.target ?? "";
      }

      updateRun(runId, (current) => {
        current.status = "completed";
        current.activeNodeId = undefined;
        current.logs.push({
          id: crypto.randomUUID(),
          status: "completed",
          message: "Workflow finished. No further branch is connected.",
          createdAt: new Date().toISOString(),
        });
      });
      return { runId };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The workflow could not be completed.";
      updateRun(runId, (current) => {
        const failedNodeId = current.activeNodeId;
        const failedNode = graph.nodes.find((node) => node.id === failedNodeId);
        current.status = "failed";
        current.activeNodeId = undefined;
        current.error = message;
        const log = current.logs.find((entry) => entry.nodeId === failedNodeId);
        if (log) {
          log.status = "failed";
          log.message = message;
        } else {
          current.logs.push({
            id: crypto.randomUUID(),
            nodeId: failedNodeId,
            nodeTitle: failedNode?.data.title,
            status: "failed",
            message,
            createdAt: new Date().toISOString(),
          });
        }
      });
      throw error;
    }
  },
);
