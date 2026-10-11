import type { RunFiles, RunRef } from "../../src/application/RunFiles";
import type { Workflow } from "../../src/domain/workflow";

// RunFiles kept in memory. `log` records the order of calls, so a test can
// check a ref was saved before something else happened.
export class MemoryRunFiles implements RunFiles {
  readonly runs = new Map<string, { workflow: Workflow; inputs: Record<string, string> }>();
  readonly refs = new Map<string, RunRef>();
  readonly log: string[] = [];

  async saveRun(runId: string, workflow: Workflow, inputs: Record<string, string>) {
    this.log.push(`saveRun ${runId}`);
    this.runs.set(runId, { workflow, inputs });
  }

  async loadRun(runId: string) {
    return this.runs.get(runId) ?? null;
  }

  async getRef(runId: string, stepId: string, attempt: number) {
    return this.refs.get(`${runId}/${stepId}/${attempt}`) ?? null;
  }

  async putRef(ref: RunRef) {
    this.log.push(`putRef ${ref.stepId}-${ref.attempt} ${ref.cursorRunId}`);
    this.refs.set(`${ref.runId}/${ref.stepId}/${ref.attempt}`, ref);
  }
}
