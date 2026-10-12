import { z } from "zod";
import { RunEvent } from "../domain/runState";
import { RunOutcome } from "./RunEngine";

// What the event log and the live stream carry: the engine's events, plus
// "the run stopped moving" (with where it stopped) and "the engine threw".
export const LogEvent = z.union([
  RunEvent,
  z.object({ type: z.literal("run-settled"), outcome: RunOutcome }),
  z.object({ type: z.literal("run-crashed"), message: z.string() }),
]);
export type LogEvent = z.infer<typeof LogEvent>;

// A LogEvent with its number in the run (1, 2, …) and when it happened.
export const LoggedEvent = z.object({ seq: z.number().int(), at: z.string(), event: LogEvent });
export type LoggedEvent = z.infer<typeof LoggedEvent>;

// Every event of every run, in order, kept so a client can replay what it missed.
export interface EventLog {
  append(runId: string, event: LoggedEvent): Promise<void>;
  // Events with seq greater than `after` (all when omitted), in order.
  read(runId: string, after?: number): Promise<LoggedEvent[]>;
  lastSeq(runId: string): Promise<number>;
}
