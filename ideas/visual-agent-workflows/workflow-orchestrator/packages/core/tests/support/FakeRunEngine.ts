import type { RunEngine, RunOutcome } from "../../src/application/RunEngine";
import type { GateDecision } from "../../src/domain/runState";
import type { Workflow } from "../../src/domain/workflow";

// A RunEngine that records each call and answers with `answer` (or `outcomeOf`
// for outcome()).
export class FakeRunEngine implements RunEngine {
  readonly calls: { method: string; runId: string; workflowId: string; arg?: unknown }[] = [];
  answer = { status: "finished", state: {} } as unknown as RunOutcome;
  outcomeOf: RunOutcome | null = null;

  async start(runId: string, workflow: Workflow, inputs: Record<string, string>) {
    this.calls.push({ method: "start", runId, workflowId: workflow.id, arg: inputs });
    return this.answer;
  }

  async resume(runId: string, workflow: Workflow, decision: GateDecision) {
    this.calls.push({ method: "resume", runId, workflowId: workflow.id, arg: decision });
    return this.answer;
  }

  async continue(runId: string, workflow: Workflow) {
    this.calls.push({ method: "continue", runId, workflowId: workflow.id });
    return this.answer;
  }

  async retry(runId: string, workflow: Workflow) {
    this.calls.push({ method: "retry", runId, workflowId: workflow.id });
    return this.answer;
  }

  async outcome(runId: string, workflow: Workflow) {
    this.calls.push({ method: "outcome", runId, workflowId: workflow.id });
    return this.outcomeOf;
  }
}
