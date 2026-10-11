import { NotFoundError } from "./errors";
import { loadRunWorkflow } from "./loadRunWorkflow";
import type { RunEngine, RunOutcome } from "./RunEngine";
import type { RunFiles } from "./RunFiles";

// Where a run stands now. NotFoundError when there is no such run.
export async function runOutcome(deps: { engine: RunEngine; runFiles: RunFiles }, runId: string): Promise<RunOutcome> {
  const outcome = await deps.engine.outcome(runId, await loadRunWorkflow(deps.runFiles, runId));
  if (!outcome) throw new NotFoundError(`run "${runId}" has no state yet`);
  return outcome;
}
