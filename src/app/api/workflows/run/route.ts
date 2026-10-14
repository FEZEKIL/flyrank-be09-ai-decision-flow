import { inngest } from "@/lib/inngest";
import { saveRun } from "@/lib/run-store";
import { workflowGraphSchema, type WorkflowRun } from "@/lib/workflow";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("graph" in body) ||
    !("input" in body) ||
    typeof body.input !== "string" ||
    body.input.trim().length === 0 ||
    body.input.length > 4000
  ) {
    return Response.json(
      { error: "Provide a workflow graph and a message of 1–4000 characters." },
      { status: 400 },
    );
  }

  const parsed = workflowGraphSchema.safeParse(body.graph);
  if (!parsed.success) {
    return Response.json(
      { error: "Workflow graph is invalid.", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const graph = parsed.data;
  const nodeIds = new Set(graph.nodes.map(({ id }) => id));
  if (nodeIds.size !== graph.nodes.length || !nodeIds.has(graph.startNodeId)) {
    return Response.json(
      { error: "Workflow node IDs must be unique and the start node must exist." },
      { status: 400 },
    );
  }

  const decisionIds = new Set(
    graph.nodes.filter((node) => node.type === "decision").map(({ id }) => id),
  );
  const branchIds = new Set<string>();
  for (const edge of graph.edges) {
    const branchKey = `${edge.source}:${edge.sourceHandle}`;
    if (
      !nodeIds.has(edge.source) ||
      !nodeIds.has(edge.target) ||
      !decisionIds.has(edge.source) ||
      branchIds.has(branchKey) ||
      edge.label !== edge.sourceHandle.toUpperCase()
    ) {
      return Response.json(
        { error: "Each branch must connect one decision output to an existing node." },
        { status: 400 },
      );
    }
    branchIds.add(branchKey);
  }

  if (!decisionIds.has(graph.startNodeId)) {
    return Response.json({ error: "The start node must be a decision node." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const run: WorkflowRun = {
    id: crypto.randomUUID(),
    status: "queued",
    input: body.input.trim(),
    logs: [],
    createdAt: now,
    updatedAt: now,
  };
  saveRun(run);

  try {
    await inngest.send({
      name: "workflow/run.requested",
      data: { runId: run.id, graph, input: run.input },
    });
  } catch (error) {
    run.status = "failed";
    run.error =
      error instanceof Error ? error.message : "Could not send the workflow to Inngest.";
    run.updatedAt = new Date().toISOString();
    return Response.json({ error: run.error }, { status: 503 });
  }

  return Response.json({ runId: run.id }, { status: 202 });
}
