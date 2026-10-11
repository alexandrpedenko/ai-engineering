import { describe, expect, it } from "vitest";
import { GateDecision } from "../../src/domain/runState";

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
