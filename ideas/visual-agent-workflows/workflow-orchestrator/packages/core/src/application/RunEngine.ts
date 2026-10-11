import type { GateDecision, RunState } from "../domain/runState";
import type { Workflow } from "../domain/workflow";

// Where a run stands after the engine has taken it as far as it can.
export type RunOutcome =
  | { status: "waiting"; gateId: string; shows: string[]; state: RunState }
  | { status: "finished"; state: RunState }
  | { status: "failed"; stepId: string; state: RunState }
  | { status: "rejected"; gateId: string; state: RunState }; // a gate hit maxRevisions

// Runs workflows: from the start to the first gate or the end, and from a
// gate's decision onwards.
export interface RunEngine {
  start(runId: string, workflow: Workflow, inputs: Record<string, string>): Promise<RunOutcome>;
  resume(runId: string, workflow: Workflow, decision: GateDecision): Promise<RunOutcome>;
  // Where a run stands now; null when there is no run with this id.
  outcome(runId: string, workflow: Workflow): Promise<RunOutcome | null>;
}
