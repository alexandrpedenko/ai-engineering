import type { Snapshot } from "../domain/outputs";
import type { Workflow } from "../domain/workflow";

// The agent run behind one attempt of a step, saved before waiting on it so a
// restarted process can find it again instead of starting a second one.
export type RunRef = {
  runId: string;
  stepId: string;
  attempt: number;
  cursorRunId: string;
  before: Snapshot; // the files before the attempt started
  startedAt: string; // ISO time
};

// What the orchestrator keeps about each run besides the engine's state.
export interface RunFiles {
  // The workflow and inputs a run started with; the run always continues against these.
  saveRun(runId: string, workflow: Workflow, inputs: Record<string, string>): Promise<void>;
  loadRun(runId: string): Promise<{ workflow: Workflow; inputs: Record<string, string> } | null>;
  getRef(runId: string, stepId: string, attempt: number): Promise<RunRef | null>;
  putRef(ref: RunRef): Promise<void>;
}
