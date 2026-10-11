import { loadRunWorkflow } from "./loadRunWorkflow";
import type { RunEngine, RunOutcome } from "./RunEngine";
import type { RunFiles } from "./RunFiles";

// Runs the failed step of a failed run again as a new attempt, against the
// workflow the run started with, until the run stops moving.
export async function retryRun(deps: { engine: RunEngine; runFiles: RunFiles }, runId: string): Promise<RunOutcome> {
  return await deps.engine.retry(runId, await loadRunWorkflow(deps.runFiles, runId));
}
