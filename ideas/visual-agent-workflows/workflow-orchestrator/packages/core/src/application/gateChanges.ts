import { diffBaseFor, type FileChanges, gateFileChanges } from "../domain/gateFiles";
import type { GateStep } from "../domain/workflow";
import { NotFoundError } from "./errors";
import { loadRunWorkflow } from "./loadRunWorkflow";
import type { ProjectFiles } from "./ProjectFiles";
import type { RunEngine } from "./RunEngine";
import type { RunFiles } from "./RunFiles";

export type GateChangesDeps = { engine: RunEngine; runFiles: RunFiles; projectFiles: ProjectFiles };

// The files a gate lists, each with how the steps before the gate changed it
// and its diff against the project as it was before the first of those steps
// (latest attempt). Works whether or not the run is waiting at the gate now.
// NotFoundError for an unknown run, a run with no state yet, or a gate that
// isn't in the run's workflow.
export async function gateChanges(deps: GateChangesDeps, runId: string, gateId: string): Promise<FileChanges> {
  const workflow = await loadRunWorkflow(deps.runFiles, runId);
  const gate = workflow.steps.find((step): step is GateStep => step.id === gateId && step.type === "gate");
  if (!gate) throw new NotFoundError(`no gate "${gateId}" in run "${runId}"`);
  const outcome = await deps.engine.outcome(runId, workflow);
  if (!outcome) throw new NotFoundError(`run "${runId}" has no state yet`);

  const files = gateFileChanges(workflow, gate, outcome.state);
  const diffs = await deps.projectFiles.diff(diffBaseFor(workflow, gate, outcome.state), files.map((f) => f.path));
  return files.map((file, i) => ({ ...file, ...(diffs[i] ?? { path: file.path, added: 0, removed: 0, diff: null }) }));
}
