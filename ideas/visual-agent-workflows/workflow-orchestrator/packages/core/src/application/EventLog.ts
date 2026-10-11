import type { RunEvent } from "../domain/runState";
import type { RunOutcome } from "./RunEngine";

// What the event log and the live stream carry: the engine's events, plus
// "the run stopped moving" (with where it stopped) and "the engine threw".
export type LogEvent = RunEvent | { type: "run-settled"; outcome: RunOutcome } | { type: "run-crashed"; message: string };

// A LogEvent with its number in the run (1, 2, …) and when it happened.
export type LoggedEvent = { seq: number; at: string; event: LogEvent };

// Every event of every run, in order, kept so a client can replay what it missed.
export interface EventLog {
  append(runId: string, event: LoggedEvent): Promise<void>;
  // Events with seq greater than `after` (all when omitted), in order.
  read(runId: string, after?: number): Promise<LoggedEvent[]>;
  lastSeq(runId: string): Promise<number>;
}
