import { GateDecision } from "../domain/runState";
import type { Workflow } from "../domain/workflow";
import { InvalidInputError } from "./errors";
import type { RunEngine, RunOutcome } from "./RunEngine";

// Continues a run waiting at a gate with a person's decision. `decision`
// comes from outside and is checked here.
export async function resumeRun(
  deps: { engine: RunEngine },
  runId: string,
  workflow: Workflow,
  decision: unknown,
): Promise<RunOutcome> {
  const parsed = GateDecision.safeParse(decision);
  if (!parsed.success) {
    throw new InvalidInputError(
      "invalid gate decision",
      parsed.error.issues.map((issue) => ({ severity: "error", message: issue.message })),
    );
  }
  return await deps.engine.resume(runId, workflow, parsed.data);
}
