import { describe, expect, it } from "vitest";
import { GateDecision, RunState, StepRecord } from "../../src/domain/runState";

describe("GateDecision", () => {
  it("accepts an approval and a rejection with feedback", () => {
    expect(GateDecision.parse({ decision: "approve" })).toEqual({ decision: "approve" });
    expect(GateDecision.parse({ decision: "reject", feedback: "add checks" })).toEqual({ decision: "reject", feedback: "add checks" });
  });

  it("refuses a rejection without feedback", () => {
    expect(GateDecision.safeParse({ decision: "reject" }).success).toBe(false);
    expect(GateDecision.safeParse({ decision: "reject", feedback: "   " }).success).toBe(false);
  });

  it("refuses anything else", () => {
    expect(GateDecision.safeParse({ decision: "maybe" }).success).toBe(false);
  });
});

describe("RunState", () => {
  it("fills missing keys, and reads records stored with the old agent run id name", () => {
    const state = RunState.parse({
      workflowId: "ba-discovery",
      steps: { elicit: { status: "done", cursorRunIds: ["a", "b"], writes: [], missing: [], summary: "", durationMs: 0 } },
    });

    expect(state).toMatchObject({ inputs: {}, feedback: {}, decisions: {}, revisions: {}, stoppedAt: null });
    expect(state.steps.elicit?.agentRunIds).toEqual(["a", "b"]);
  });

  it("refuses a record whose base tree isn't a git object id", () => {
    const record = { status: "done", agentRunIds: [], writes: [], missing: [], summary: "", durationMs: 0 };
    expect(StepRecord.safeParse({ ...record, baseTree: "a".repeat(40) }).success).toBe(true);
    expect(StepRecord.safeParse({ ...record, baseTree: "--output=x" }).success).toBe(false);
  });
});
