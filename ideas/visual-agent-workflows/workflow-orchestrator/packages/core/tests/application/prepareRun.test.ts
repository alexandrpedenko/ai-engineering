import { describe, expect, it } from "vitest";
import { InvalidInputError } from "../../src/application/errors";
import { prepareRun } from "../../src/application/prepareRun";
import { DEFAULT_PHASES } from "../../src/domain/phase";
import { MemoryRunFiles } from "../support/MemoryRunFiles";
import { baWorkflow, registry } from "../support/workflows";

const deps = (runFiles = new MemoryRunFiles()) => ({
  runFiles,
  registry,
  phases: DEFAULT_PHASES,
  newId: () => "run-7",
  now: () => new Date("2026-10-11T12:00:00Z"),
});

describe("prepareRun", () => {
  it("saves the run with its start time and returns the new id", async () => {
    const runFiles = new MemoryRunFiles();

    expect(await prepareRun(deps(runFiles), baWorkflow(), { focus: "x" })).toBe("run-7");
    expect(runFiles.runs.get("run-7")).toEqual({ workflow: baWorkflow(), inputs: { focus: "x" }, startedAt: "2026-10-11T12:00:00.000Z" });
  });

  it("saves nothing for a workflow with errors or a missing required input", async () => {
    const runFiles = new MemoryRunFiles();
    const broken = baWorkflow((w) => Object.assign(w.steps[0]!, { agent: "ghost" }));
    const needsInput = baWorkflow((w) => Object.assign(w.inputs[0]!, { required: true }));

    await expect(prepareRun(deps(runFiles), broken, {})).rejects.toBeInstanceOf(InvalidInputError);
    await expect(prepareRun(deps(runFiles), needsInput, {})).rejects.toThrow('input "focus" (What to focus on) is required');
    expect(runFiles.runs.size).toBe(0);
  });
});
