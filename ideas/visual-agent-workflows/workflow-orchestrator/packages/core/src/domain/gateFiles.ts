import type { RunState } from "./runState";
import type { GateStep, Workflow } from "./workflow";

// The files a gate asks the reviewer to read. The gate's own `shows` when it
// has any; otherwise the files created or modified by the agent steps from the
// gate's `onReject` step up to the gate (their latest attempt), in step order,
// each once. Deleted files are left out: there is nothing to read.
export function gateFiles(workflow: Workflow, gate: GateStep, state: RunState): string[] {
  if (gate.shows.length > 0) return gate.shows;

  const next = new Map(workflow.edges.map((edge) => [edge.from, edge.to]));
  const path: string[] = [];
  let id: string | undefined = gate.onReject;
  while (id !== undefined && id !== gate.id && !path.includes(id)) {
    path.push(id);
    id = next.get(id);
  }
  if (id !== gate.id) return [];

  const files: string[] = [];
  for (const stepId of path) {
    for (const write of state.steps[stepId]?.writes ?? []) {
      if (write.change !== "deleted" && !files.includes(write.path)) files.push(write.path);
    }
  }
  return files;
}
