import { loadRunWorkflow } from "./loadRunWorkflow";
import type { RunEngine, RunOutcome } from "./RunEngine";
import type { RunFiles } from "./RunFiles";

export type RunSummary = {
  runId: string;
  workflowId: string;
  startedAt: string;
  status: RunOutcome["status"] | "starting"; // "starting": saved, engine has no state yet
  busy: boolean;
};

export type RunListDeps = { engine: RunEngine; runFiles: RunFiles; isBusy: (runId: string) => boolean };

// Every run, newest first, optionally only one workflow's, with where each stands.
export async function listRuns(deps: RunListDeps, workflowId?: string): Promise<RunSummary[]> {
  const runs = (await deps.runFiles.listRuns()).filter((run) => !workflowId || run.workflowId === workflowId);
  const summaries: RunSummary[] = [];
  for (const run of runs) {
    const outcome = await deps.engine.outcome(run.runId, await loadRunWorkflow(deps.runFiles, run.runId));
    summaries.push({ ...run, status: outcome?.status ?? "starting", busy: deps.isBusy(run.runId) });
  }
  return summaries;
}
