import type { RunFiles, RunRef, SavedRun } from "../../src/application/RunFiles";
import type { Workflow } from "../../src/domain/workflow";

// RunFiles kept in memory. `log` records the order of calls, so a test can
// check a ref was saved before something else happened.
export class MemoryRunFiles implements RunFiles {
  readonly runs = new Map<string, SavedRun>();
  readonly refs = new Map<string, RunRef>();
  readonly log: string[] = [];

  async saveRun(runId: string, run: SavedRun) {
    this.log.push(`saveRun ${runId}`);
    this.runs.set(runId, run);
  }

  async loadRun(runId: string) {
    return this.runs.get(runId) ?? null;
  }

  async listRuns() {
    return [...this.runs.entries()]
      .map(([runId, run]) => ({ runId, workflowId: run.workflow.id, startedAt: run.startedAt }))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async getRef(runId: string, stepId: string, attempt: number) {
    return this.refs.get(`${runId}/${stepId}/${attempt}`) ?? null;
  }

  async deleteRun(runId: string) {
    this.log.push(`deleteRun ${runId}`);
    this.runs.delete(runId);
    for (const key of this.refs.keys()) if (key.startsWith(`${runId}/`)) this.refs.delete(key);
  }

  async putRef(ref: RunRef) {
    this.log.push(`putRef ${ref.stepId}-${ref.attempt} ${ref.agentRunId}`);
    this.refs.set(`${ref.runId}/${ref.stepId}/${ref.attempt}`, ref);
  }
}

// A saved run of `workflow`, for tests that need one to exist.
export const savedRun = (workflow: Workflow, inputs: Record<string, string> = {}, startedAt = "2026-10-11T12:00:00.000Z"): SavedRun => ({
  workflow,
  inputs,
  startedAt,
});
