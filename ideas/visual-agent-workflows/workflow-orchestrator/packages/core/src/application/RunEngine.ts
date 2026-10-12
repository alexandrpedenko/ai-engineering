import { z } from "zod";
import { type GateDecision, RunState } from "../domain/runState";
import type { Workflow } from "../domain/workflow";

// Where a run stands after the engine has taken it as far as it can.
export const RunOutcome = z.discriminatedUnion("status", [
  z.object({ status: z.literal("waiting"), gateId: z.string(), shows: z.array(z.string()), state: RunState }),
  z.object({ status: z.literal("finished"), state: RunState }),
  z.object({ status: z.literal("failed"), stepId: z.string(), state: RunState }),
  z.object({ status: z.literal("rejected"), gateId: z.string(), state: RunState }), // a gate hit maxRevisions
  z.object({ status: z.literal("interrupted"), stepId: z.string(), state: RunState }), // its process stopped inside a step
]);
export type RunOutcome = z.infer<typeof RunOutcome>;

// Runs workflows: from the start to the first gate or the end, and from a
// gate's decision onwards.
export interface RunEngine {
  start(runId: string, workflow: Workflow, inputs: Record<string, string>): Promise<RunOutcome>;
  resume(runId: string, workflow: Workflow, decision: GateDecision): Promise<RunOutcome>;
  // Re-enters the step an interrupted run stopped inside.
  continue(runId: string, workflow: Workflow): Promise<RunOutcome>;
  // Runs the failed step of a failed run again, as a new attempt, and goes on from there.
  retry(runId: string, workflow: Workflow): Promise<RunOutcome>;
  // Where a run stands now; null when there is no run with this id.
  outcome(runId: string, workflow: Workflow): Promise<RunOutcome | null>;
  // Forgets the run's state.
  deleteRun(runId: string): Promise<void>;
}
