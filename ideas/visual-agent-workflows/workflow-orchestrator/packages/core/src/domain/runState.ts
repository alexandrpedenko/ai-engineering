import { z } from "zod";
import { FileChange } from "./outputs";

// Run state is stored (LangGraph checkpoints, the event log) and read back,
// so each part is a schema; the types are what the schemas give.

// What an agent reports while it works. Only the parts that stay stable
// across agent SDK versions: no tool arguments or results.
export const StepEvent = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({ kind: z.literal("thinking"), text: z.string() }),
  z.object({ kind: z.literal("tool"), callId: z.string(), name: z.string(), status: z.enum(["running", "completed", "error"]) }),
  z.object({ kind: z.literal("status"), status: z.string() }),
]);
export type StepEvent = z.infer<typeof StepEvent>;

export const Usage = z.object({ inputTokens: z.number(), outputTokens: z.number() });
export type Usage = z.infer<typeof Usage>;

// A git object id: 40 (SHA-1) or 64 (SHA-256) hex characters.
export const GitObjectId = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/, "not a git object id");

// Renames fields a record stored before slice 9 used.
function upgradeRecord(value: unknown): unknown {
  if (typeof value !== "object" || value === null || !("cursorRunIds" in value) || "agentRunIds" in value) return value;
  const { cursorRunIds, ...rest } = value as Record<string, unknown>;
  return { ...rest, agentRunIds: cursorRunIds };
}

// The result of an agent step's latest attempt.
export const StepRecord = z.preprocess(
  upgradeRecord,
  z.object({
    status: z.enum(["done", "failed"]),
    agentRunIds: z.array(z.string()), // one per attempt that reached an agent run, oldest first
    writes: z.array(FileChange),
    missing: z.array(z.string()), // declared writes that did not happen
    summary: z.string(), // the agent's final message
    usage: Usage.optional(),
    durationMs: z.number(),
    // The git tree of the project recorded before the attempt started; absent
    // when there is none (not a git repository, or recorded before trees were kept).
    baseTree: GitObjectId.optional(),
  }),
);
export type StepRecord = z.infer<typeof StepRecord>;

// A person's answer at a gate. Arrives from outside, so it is a schema.
export const GateDecision = z.discriminatedUnion("decision", [
  z.strictObject({ decision: z.literal("approve") }),
  z.strictObject({ decision: z.literal("reject"), feedback: z.string().trim().min(1, "say what to change") }),
]);
export type GateDecision = z.infer<typeof GateDecision>;

// Everything a run remembers between steps. Missing keys read as empty.
export const RunState = z.object({
  workflowId: z.string(),
  inputs: z.record(z.string(), z.string()).default({}),
  steps: z.record(z.string(), StepRecord).default({}), // by step id
  feedback: z.record(z.string(), z.array(z.string())).default({}), // by agent step id, oldest first
  decisions: z.record(z.string(), z.array(GateDecision)).default({}), // by gate id, oldest first
  revisions: z.record(z.string(), z.number()).default({}), // by gate id: rejections that sent work back
  stoppedAt: z.string().nullable().default(null), // the gate that ended the run by hitting maxRevisions
});
export type RunState = z.infer<typeof RunState>;

// What the engine reports while a run goes on.
export const RunEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("step-started"), stepId: z.string(), attempt: z.number() }),
  z.object({ type: z.literal("agent-event"), stepId: z.string(), event: StepEvent }),
  z.object({ type: z.literal("step-finished"), stepId: z.string(), record: StepRecord }),
  z.object({ type: z.literal("gate-waiting"), gateId: z.string(), shows: z.array(z.string()) }),
]);
export type RunEvent = z.infer<typeof RunEvent>;
