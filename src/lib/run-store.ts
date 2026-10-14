import type { WorkflowRun } from "@/lib/workflow";

declare global {
  var __branchlineWorkflowRuns: Map<string, WorkflowRun> | undefined;
}

const runs =
  globalThis.__branchlineWorkflowRuns ??
  (globalThis.__branchlineWorkflowRuns = new Map<string, WorkflowRun>());

export function saveRun(run: WorkflowRun) {
  runs.set(run.id, run);
}

export function getRun(id: string) {
  return runs.get(id);
}

export function updateRun(id: string, update: (run: WorkflowRun) => void) {
  const run = runs.get(id);
  if (!run) {
    throw new Error(`Workflow run ${id} was not found.`);
  }

  update(run);
  run.updatedAt = new Date().toISOString();
}
