import type { FileChanges, GateDecision, LoggedEvent, LogEvent, Phase, Problem, Registry, RunSummary, Workflow, WorkflowSummary } from "@orch/core";
import type { OrchestratorApi } from "../../src/application/OrchestratorApi";
import { ApiError } from "../../src/domain/apiError";
import type { RunDetails } from "../../src/domain/runView";
import { registry, workflow } from "./sampleData";

// A file's version in the fake: "v:" and its content.
export const versionOf = (content: string) => `v:${content}`;

// An OrchestratorApi whose answers a test sets directly. Records every action
// in `calls`; `emit` pushes a live event to whoever watches that run.
export class FakeOrchestratorApi implements OrchestratorApi {
  serverUp: boolean | Error = true;
  registry: Registry = registry;
  phaseList: Phase[] = [
    { id: "discovery", name: "Discovery", order: 1 },
    { id: "delivery", name: "Delivery", order: 2 },
  ];
  workflowList: WorkflowSummary[] = [
    { id: "ba-discovery", name: "BA discovery", phase: "discovery", agents: ["business-analyst", "architect"], skills: ["requirements-elicitation"], problems: [] },
  ];
  workflowsById: Record<string, { workflow: Workflow; problems: Problem[] }> = { "ba-discovery": { workflow, problems: [] } };
  runList: RunSummary[] = [];
  runsById: Record<string, RunDetails> = {};
  files: Record<string, string> = {};
  changes: Record<string, FileChanges> = {}; // by "runId/gateId"; unknown gates answer 404
  history: Record<string, LoggedEvent[]> = {};
  startedRunId = "run-new";
  checkProblems: Problem[] = []; // what checkWorkflow answers
  readonly saved: Workflow[] = []; // every workflow sent to createWorkflow or saveWorkflow, in order
  readonly checked: Workflow[] = []; // every workflow sent to checkWorkflow, in order
  failures: Partial<Record<keyof OrchestratorApi, Error>> = {};
  readonly calls: string[] = [];
  private readonly watchers = new Map<string, Set<(event: LoggedEvent) => void>>();

  private fail(method: keyof OrchestratorApi) {
    const error = this.failures[method];
    if (error) throw error;
  }

  runtime = "fake";
  async health() {
    if (this.serverUp instanceof Error) throw this.serverUp;
    return { up: this.serverUp, runtime: this.runtime };
  }
  async project() {
    this.fail("project");
    return this.registry;
  }
  async phases() {
    return this.phaseList;
  }
  async workflows() {
    return this.workflowList;
  }
  async workflow(id: string) {
    const found = this.workflowsById[id];
    if (!found) throw new ApiError(404, `no workflow "${id}"`);
    return found;
  }
  async createWorkflow(workflow: Workflow) {
    this.calls.push(`create ${workflow.id}`);
    this.fail("createWorkflow");
    if (this.workflowsById[workflow.id]) throw new ApiError(409, `a workflow "${workflow.id}" already exists`);
    this.store(workflow);
    return { problems: [] };
  }
  async saveWorkflow(workflow: Workflow) {
    this.calls.push(`save ${workflow.id}`);
    this.fail("saveWorkflow");
    this.store(workflow);
    return { problems: [] };
  }
  async deleteWorkflow(id: string) {
    this.calls.push(`delete ${id}`);
    this.fail("deleteWorkflow");
    delete this.workflowsById[id];
    this.workflowList = this.workflowList.filter((w) => w.id !== id);
  }
  async checkWorkflow(workflow: Workflow) {
    this.calls.push(`check ${workflow.id}`);
    this.checked.push(workflow);
    this.fail("checkWorkflow");
    return this.checkProblems;
  }
  async runs(workflowId?: string) {
    this.fail("runs");
    return this.runList.filter((run) => !workflowId || run.workflowId === workflowId);
  }
  async run(runId: string) {
    const found = this.runsById[runId];
    if (!found) throw new ApiError(404, `no run "${runId}"`);
    return found;
  }
  async gateChanges(runId: string, gateId: string) {
    this.calls.push(`gateChanges ${runId} ${gateId}`);
    const found = this.changes[`${runId}/${gateId}`];
    if (!found) throw new ApiError(404, `no gate "${gateId}" in run "${runId}"`);
    return found;
  }
  async file(path: string) {
    const content = this.files[path];
    if (content === undefined) throw new ApiError(404, `no file "${path}"`);
    return { path, content, version: versionOf(content) };
  }
  // Refuses (409) when `baseVersion` is given and isn't the file's version in `files`.
  async saveFile(path: string, content: string, baseVersion?: string) {
    this.calls.push(`saveFile ${path}${baseVersion === undefined ? " (overwrite)" : ""}`);
    this.fail("saveFile");
    const current = this.files[path];
    if (baseVersion !== undefined && current !== undefined && versionOf(current) !== baseVersion) {
      throw new ApiError(409, `"${path}" changed on disk since it was opened`);
    }
    this.files[path] = content;
    return { version: versionOf(content) };
  }
  async startRun(workflowId: string, inputs: Record<string, string>) {
    this.calls.push(`start ${workflowId} ${JSON.stringify(inputs)}`);
    this.fail("startRun");
    return { runId: this.startedRunId };
  }
  async resume(runId: string, decision: GateDecision) {
    this.calls.push(`resume ${runId} ${decision.decision === "approve" ? "approve" : `reject:${decision.feedback}`}`);
    this.fail("resume");
  }
  async continueRun(runId: string) {
    this.calls.push(`continue ${runId}`);
  }
  async retry(runId: string) {
    this.calls.push(`retry ${runId}`);
  }
  async cancel(runId: string) {
    this.calls.push(`cancel ${runId}`);
  }
  async deleteRun(runId: string) {
    this.calls.push(`deleteRun ${runId}`);
    this.fail("deleteRun");
    if (!this.runsById[runId]) throw new ApiError(404, `no run "${runId}"`);
    delete this.runsById[runId];
    this.runList = this.runList.filter((run) => run.runId !== runId);
  }
  watchRun(runId: string, after: number, onEvent: (event: LoggedEvent) => void) {
    this.calls.push(`watch ${runId} after ${after}`);
    for (const event of this.history[runId] ?? []) if (event.seq > after) onEvent(event);
    const set = this.watchers.get(runId) ?? new Set();
    set.add(onEvent);
    this.watchers.set(runId, set);
    return () => {
      set.delete(onEvent);
      this.calls.push(`stop ${runId}`);
    };
  }

  // Keeps a created or saved workflow, so later reads return it.
  private store(workflow: Workflow) {
    this.saved.push(workflow);
    this.workflowsById[workflow.id] = { workflow, problems: [] };
    const agentSteps = workflow.steps.filter((step) => step.type === "agent");
    const summary: WorkflowSummary = {
      id: workflow.id,
      name: workflow.name,
      agents: [...new Set(agentSteps.map((step) => step.agent))],
      skills: [...new Set(agentSteps.flatMap((step) => step.skills))],
      problems: [],
    };
    if (workflow.phase) summary.phase = workflow.phase;
    this.workflowList = [...this.workflowList.filter((w) => w.id !== workflow.id), summary];
  }

  // Sends a live event to everyone watching the run.
  emit(runId: string, seq: number, event: LogEvent) {
    for (const listener of this.watchers.get(runId) ?? []) listener({ seq, at: "", event });
  }
}
