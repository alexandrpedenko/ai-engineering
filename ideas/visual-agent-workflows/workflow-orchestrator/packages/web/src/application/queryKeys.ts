// Every TanStack Query key in the app, so invalidation can't miss one by a typo.
export const queryKeys = {
  health: ["health"] as const,
  project: ["project"] as const,
  phases: ["phases"] as const,
  workflows: ["workflows"] as const,
  workflow: (id: string) => ["workflows", id] as const,
  workflowCheck: (draft: unknown) => ["workflow-check", draft] as const,
  // Every runs list (a prefix of `runs`), not single runs.
  runLists: ["runs", "list"] as const,
  runs: (workflowId?: string) => ["runs", "list", workflowId ?? "all"] as const,
  run: (runId: string) => ["runs", "one", runId] as const,
  gateChangesOf: (runId: string) => ["runs", "gate-changes", runId] as const,
  gateChanges: (runId: string, gateId: string) => ["runs", "gate-changes", runId, gateId] as const,
  file: (path: string) => ["files", path] as const,
};
