import { z } from "zod";
import type { FileChange } from "./outputs";

// What an agent reports while it works. Only the parts that stay stable
// across agent SDK versions: no tool arguments or results.
export type StepEvent =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool"; callId: string; name: string; status: "running" | "completed" | "error" }
  | { kind: "status"; status: string };

export type Usage = { inputTokens: number; outputTokens: number };

// The result of an agent step's latest attempt.
export type StepRecord = {
  status: "done" | "failed";
  cursorRunIds: string[]; // one per attempt, oldest first
  writes: FileChange[];
  missing: string[]; // declared writes that did not happen
  summary: string; // the agent's final message
  usage?: Usage;
  durationMs: number;
  // The git tree of the project recorded before the attempt started; absent
  // when there is none (not a git repository, or recorded before trees were kept).
  baseTree?: string;
};

// A person's answer at a gate. Arrives from outside, so it is a schema.
export const GateDecision = z.discriminatedUnion("decision", [
  z.strictObject({ decision: z.literal("approve") }),
  z.strictObject({ decision: z.literal("reject"), feedback: z.string().trim().min(1, "say what to change") }),
]);
export type GateDecision = z.infer<typeof GateDecision>;

// Everything a run remembers between steps.
export type RunState = {
  workflowId: string;
  inputs: Record<string, string>;
  steps: Record<string, StepRecord>; // by step id
  feedback: Record<string, string[]>; // by agent step id, oldest first
  decisions: Record<string, GateDecision[]>; // by gate id, oldest first
  revisions: Record<string, number>; // by gate id: rejections that sent work back
  stoppedAt: string | null; // the gate that ended the run by hitting maxRevisions
};

// What the engine reports while a run goes on.
export type RunEvent =
  | { type: "step-started"; stepId: string; attempt: number }
  | { type: "agent-event"; stepId: string; event: StepEvent }
  | { type: "step-finished"; stepId: string; record: StepRecord }
  | { type: "gate-waiting"; gateId: string; shows: string[] };
