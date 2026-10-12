import type { Snapshot } from "../domain/outputs";
import type { Workflow } from "../domain/workflow";

// The agent run behind one attempt of a step, saved before waiting on it so a
// restarted process can find it again instead of starting a second one.
export type RunRef = {
  runId: string;
  stepId: string;
  attempt: number;
  agentRunId: string;
  before: Snapshot; // the files before the attempt started
  baseTree: string | null; // the git tree before the attempt started (ProjectFiles.recordTree)
  startedAt: string; // ISO time
};

export type SavedRun = { workflow: Workflow; inputs: Record<string, string>; startedAt: string };

// What the orchestrator keeps about each run besides the engine's state.
export interface RunFiles {
  // The workflow and inputs a run started with; the run always continues against these.
  saveRun(runId: string, run: SavedRun): Promise<void>;
  loadRun(runId: string): Promise<SavedRun | null>;
  // Every saved run that can be read, newest first.
  listRuns(): Promise<{ runId: string; workflowId: string; startedAt: string }[]>;
  getRef(runId: string, stepId: string, attempt: number): Promise<RunRef | null>;
  putRef(ref: RunRef): Promise<void>;
  // Removes everything kept about the run (its refs and event log included).
  deleteRun(runId: string): Promise<void>;
}
