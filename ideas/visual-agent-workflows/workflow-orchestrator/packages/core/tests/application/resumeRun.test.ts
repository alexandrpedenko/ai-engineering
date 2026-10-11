import { describe, expect, it } from "vitest";
import { InvalidInputError } from "../../src/application/errors";
import type { RunEngine, RunOutcome } from "../../src/application/RunEngine";
import { resumeRun } from "../../src/application/resumeRun";
import type { GateDecision } from "../../src/domain/runState";
import { baWorkflow } from "../support/workflows";

function fakeEngine() {
  const resumed: { runId: string; decision: GateDecision }[] = [];
  const engine: RunEngine = {
    start: async () => {
      throw new Error("not used");
    },
    resume: async (runId, _workflow, decision) => {
      resumed.push({ runId, decision });
      return { status: "finished", state: {} } as unknown as RunOutcome;
    },
    outcome: async () => null,
  };
  return { engine, resumed };
}

describe("resumeRun", () => {
  it("passes a valid decision to the engine", async () => {
    const { engine, resumed } = fakeEngine();

    await resumeRun({ engine }, "run-1", baWorkflow(), { decision: "reject", feedback: "more detail" });

    expect(resumed).toEqual([{ runId: "run-1", decision: { decision: "reject", feedback: "more detail" } }]);
  });

  it("refuses a malformed decision before reaching the engine", async () => {
    const { engine, resumed } = fakeEngine();

    await expect(resumeRun({ engine }, "run-1", baWorkflow(), { decision: "reject" })).rejects.toBeInstanceOf(InvalidInputError);
    await expect(resumeRun({ engine }, "run-1", baWorkflow(), "approve")).rejects.toBeInstanceOf(InvalidInputError);
    expect(resumed).toEqual([]);
  });
});
