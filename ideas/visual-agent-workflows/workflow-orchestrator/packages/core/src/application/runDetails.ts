import { NotFoundError } from "./errors";
import type { RunListDeps } from "./listRuns";

// One run: the workflow and inputs it started with, whether it's moving, and
// where it stands (null outcome: saved, but the engine has no state yet).
export async function runDetails(deps: RunListDeps, runId: string) {
  const run = await deps.runFiles.loadRun(runId);
  if (!run) throw new NotFoundError(`no run "${runId}"`);
  const outcome = await deps.engine.outcome(runId, run.workflow);
  return { runId, ...run, busy: deps.isBusy(runId), outcome };
}
