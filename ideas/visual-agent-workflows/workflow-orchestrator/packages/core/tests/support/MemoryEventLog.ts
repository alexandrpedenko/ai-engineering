import type { EventLog, LoggedEvent } from "../../src/application/EventLog";

// EventLog kept in memory. A test can hold every append until `releaseAppends()`,
// or make appends or lastSeq fail.
export class MemoryEventLog implements EventLog {
  readonly events = new Map<string, LoggedEvent[]>();
  failAppend: Error | null = null;
  failLastSeq: Error | null = null;
  private held: Promise<void> | null = null;
  private release: () => void = () => {};

  holdAppends(): void {
    this.held = new Promise((resolve) => (this.release = resolve));
  }

  releaseAppends(): void {
    this.held = null;
    this.release();
  }

  async append(runId: string, event: LoggedEvent) {
    if (this.held) await this.held;
    if (this.failAppend) throw this.failAppend;
    this.events.set(runId, [...(this.events.get(runId) ?? []), event]);
  }

  async read(runId: string, after = 0) {
    return (this.events.get(runId) ?? []).filter((e) => e.seq > after);
  }

  async lastSeq(runId: string) {
    if (this.failLastSeq) throw this.failLastSeq;
    return this.events.get(runId)?.at(-1)?.seq ?? 0;
  }
}
