import { loadRunWorkflow } from "./loadRunWorkflow";
import type { RunEngine, RunOutcome } from "./RunEngine";
import type { RunFiles } from "./RunFiles";

// Re-enters the step an interrupted run stopped inside (the step reattaches to
// its agent run when it can).
export async function continueRun(deps: { engine: RunEngine; runFiles: RunFiles }, runId: string): Promise<RunOutcome> {
  return await deps.engine.continue(runId, await loadRunWorkflow(deps.runFiles, runId));
}
