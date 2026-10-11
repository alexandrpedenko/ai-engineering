import type { Workflow } from "../domain/workflow";
import { NotFoundError } from "./errors";
import type { RunFiles } from "./RunFiles";

// The workflow a run started with. NotFoundError when there is no such run.
export async function loadRunWorkflow(runFiles: RunFiles, runId: string): Promise<Workflow> {
  const run = await runFiles.loadRun(runId);
  if (!run) throw new NotFoundError(`no run "${runId}"`);
  return run.workflow;
}
