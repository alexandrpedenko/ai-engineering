import type { EventLog, LoggedEvent } from "../../src/application/EventLog";

// EventLog kept in memory.
export class MemoryEventLog implements EventLog {
  readonly events = new Map<string, LoggedEvent[]>();

  async append(runId: string, event: LoggedEvent) {
    this.events.set(runId, [...(this.events.get(runId) ?? []), event]);
  }

  async read(runId: string, after = 0) {
    return (this.events.get(runId) ?? []).filter((e) => e.seq > after);
  }

  async lastSeq(runId: string) {
    return this.events.get(runId)?.at(-1)?.seq ?? 0;
  }
}
