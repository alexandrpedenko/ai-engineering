import type { GateDecision, LoggedEvent, Phase, Problem, Registry, RunSummary, Workflow, WorkflowSummary } from "@orch/core";
import type { RunDetails } from "../domain/runView";

// What the web app needs from the orchestrator server. Hooks depend on this,
// never on fetch; web/src/api implements it. Failed requests reject with ApiError.
export interface OrchestratorApi {
  // Whether the server answers, and which agent runtime it uses ("cursor", "claude", "fake").
  health(): Promise<{ up: boolean; runtime?: string }>;
  project(): Promise<Registry>;
  phases(): Promise<Phase[]>;
  workflows(): Promise<WorkflowSummary[]>;
  workflow(id: string): Promise<{ workflow: Workflow; problems: Problem[] }>;
  // Saves a new workflow file; a 409 ApiError when its id is taken.
  createWorkflow(workflow: Workflow): Promise<{ problems: Problem[] }>;
  // Overwrites the workflow file with the same id.
  saveWorkflow(workflow: Workflow): Promise<{ problems: Problem[] }>;
  deleteWorkflow(id: string): Promise<void>;
  // A draft's problems, without saving it.
  checkWorkflow(workflow: Workflow): Promise<Problem[]>;
  runs(workflowId?: string): Promise<RunSummary[]>;
  run(runId: string): Promise<RunDetails>;
  // A project file's text and version (which changes whenever the text does).
  file(path: string): Promise<{ path: string; content: string; version: string }>;
  // Saves a project file and returns its new version. With `baseVersion`, a
  // 409 ApiError when the file changed on disk since that version.
  saveFile(path: string, content: string, baseVersion?: string): Promise<{ version: string }>;
  startRun(workflowId: string, inputs: Record<string, string>): Promise<{ runId: string }>;
  resume(runId: string, decision: GateDecision): Promise<void>;
  continueRun(runId: string): Promise<void>;
  retry(runId: string): Promise<void>;
  cancel(runId: string): Promise<void>;
  // Calls onEvent for every event of the run after `after`, then for live
  // ones, until the returned function is called.
  watchRun(runId: string, after: number, onEvent: (event: LoggedEvent) => void): () => void;
}
