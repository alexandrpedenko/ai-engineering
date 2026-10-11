import { GateDecision } from "../domain/runState";
import { InvalidInputError } from "./errors";
import { loadRunWorkflow } from "./loadRunWorkflow";
import type { RunEngine, RunOutcome } from "./RunEngine";
import type { RunFiles } from "./RunFiles";

// Continues a run waiting at a gate with a person's decision, against the
// workflow the run started with. `decision` comes from outside and is checked here.
export async function resumeRun(deps: { engine: RunEngine; runFiles: RunFiles }, runId: string, decision: unknown): Promise<RunOutcome> {
  const parsed = GateDecision.safeParse(decision);
  if (!parsed.success) {
    throw new InvalidInputError(
      "invalid gate decision",
      parsed.error.issues.map((issue) => ({ severity: "error", message: issue.message })),
    );
  }
  return await deps.engine.resume(runId, await loadRunWorkflow(deps.runFiles, runId), parsed.data);
}
