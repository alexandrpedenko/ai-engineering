import { ConflictError } from "../../src/application/errors";
import type { LeaseHolder, RunLease } from "../../src/application/RunLease";

// A RunLease in memory. `held` set by a test stands for another process.
export class MemoryRunLease implements RunLease {
  held: LeaseHolder | null = null;
  readonly log: string[] = [];

  async acquire(runId: string) {
    if (this.held && !(this.held.mine && this.held.runId === runId) && this.held.alive) {
      throw new ConflictError(`run "${this.held.runId}" is moving in another process (pid ${this.held.pid})`);
    }
    this.held = { pid: 1, runId, since: "", alive: true, mine: true };
    this.log.push(`acquire ${runId}`);
  }

  async release(runId: string) {
    if (this.held?.mine && this.held.runId === runId) this.held = null;
    this.log.push(`release ${runId}`);
  }

  async holder() {
    return this.held;
  }
}
