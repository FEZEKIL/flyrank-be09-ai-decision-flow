import { z } from "zod";
import type { Edge, Node } from "@xyflow/react";

export const decisionNodeDataSchema = z.object({
  title: z.string().trim().min(1).max(80),
  prompt: z.string().trim().min(1).max(2000),
});

export const outcomeNodeDataSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240),
});

export const workflowNodeSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().min(1).max(100),
    type: z.literal("decision"),
    position: z.object({ x: z.number().finite(), y: z.number().finite() }),
    data: decisionNodeDataSchema,
  }),
  z.object({
    id: z.string().min(1).max(100),
    type: z.literal("outcome"),
    position: z.object({ x: z.number().finite(), y: z.number().finite() }),
    data: outcomeNodeDataSchema,
  }),
]);

export const workflowEdgeSchema = z.object({
  id: z.string().min(1).max(200),
  source: z.string().min(1).max(100),
  target: z.string().min(1).max(100),
  sourceHandle: z.enum(["yes", "no"]),
  targetHandle: z.literal("input"),
  label: z.enum(["YES", "NO"]),
});

export const workflowGraphSchema = z.object({
  title: z.string().trim().min(1).max(80),
  startNodeId: z.string().min(1).max(100),
  nodes: z.array(workflowNodeSchema).min(1).max(40),
  edges: z.array(workflowEdgeSchema).max(80),
});

export type DecisionNodeData = z.infer<typeof decisionNodeDataSchema> & {
  runStatus?: "active" | "completed" | "failed";
  result?: "YES" | "NO";
};
export type OutcomeNodeData = z.infer<typeof outcomeNodeDataSchema> & {
  runStatus?: "completed";
};
export type DecisionNode = Node<DecisionNodeData, "decision">;
export type OutcomeNode = Node<OutcomeNodeData, "outcome">;
export type WorkflowNode = DecisionNode | OutcomeNode;
export type WorkflowEdge = Edge;

export type WorkflowGraph = {
  title: string;
  startNodeId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

export type RunLog = {
  id: string;
  nodeId?: string;
  nodeTitle?: string;
  status: "running" | "completed" | "failed";
  message: string;
  result?: "YES" | "NO";
  createdAt: string;
};

export type WorkflowRun = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  input: string;
  activeNodeId?: string;
  logs: RunLog[];
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export const runLogSchema = z.object({
  id: z.string(),
  nodeId: z.string().optional(),
  nodeTitle: z.string().optional(),
  status: z.enum(["running", "completed", "failed"]),
  message: z.string(),
  result: z.enum(["YES", "NO"]).optional(),
  createdAt: z.string(),
});

export const workflowRunSchema = z.object({
  id: z.string(),
  status: z.enum(["queued", "running", "completed", "failed"]),
  input: z.string(),
  activeNodeId: z.string().optional(),
  logs: z.array(runLogSchema),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const starterWorkflow: WorkflowGraph = {
  title: "Support request router",
  startNodeId: "triage",
  nodes: [
    {
      id: "triage",
      type: "decision",
      position: { x: 170, y: 170 },
      data: {
        title: "Classify request",
        prompt:
          "Is this message asking for help with an existing product, account, or technical issue?",
      },
    },
    {
      id: "support",
      type: "outcome",
      position: { x: 660, y: 40 },
      data: {
        title: "Support queue",
        description: "Route to the customer support team.",
      },
    },
    {
      id: "sales",
      type: "outcome",
      position: { x: 660, y: 310 },
      data: {
        title: "Sales handoff",
        description: "Route to the sales team.",
      },
    },
  ],
  edges: [
    {
      id: "triage-yes-support",
      source: "triage",
      sourceHandle: "yes",
      target: "support",
      targetHandle: "input",
      label: "YES",
      type: "smoothstep",
      animated: true,
    },
    {
      id: "triage-no-sales",
      source: "triage",
      sourceHandle: "no",
      target: "sales",
      targetHandle: "input",
      label: "NO",
      type: "smoothstep",
    },
  ],
};
