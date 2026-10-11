import { describe, expect, it } from "vitest";
import { InvalidInputError, NotFoundError } from "../../src/application/errors";
import { resumeRun } from "../../src/application/resumeRun";
import { FakeRunEngine } from "../support/FakeRunEngine";
import { MemoryRunFiles } from "../support/MemoryRunFiles";
import { baWorkflow } from "../support/workflows";

async function setup() {
  const engine = new FakeRunEngine();
  const runFiles = new MemoryRunFiles();
  await runFiles.saveRun("run-1", baWorkflow(), {});
  return { engine, runFiles };
}

describe("resumeRun", () => {
  it("passes a valid decision to the engine with the run's own workflow", async () => {
    const deps = await setup();

    await resumeRun(deps, "run-1", { decision: "reject", feedback: "more detail" });

    expect(deps.engine.calls).toEqual([
      { method: "resume", runId: "run-1", workflowId: "ba-discovery", arg: { decision: "reject", feedback: "more detail" } },
    ]);
  });

  it("refuses a malformed decision before reaching the engine", async () => {
    const deps = await setup();

    await expect(resumeRun(deps, "run-1", { decision: "reject" })).rejects.toBeInstanceOf(InvalidInputError);
    await expect(resumeRun(deps, "run-1", "approve")).rejects.toBeInstanceOf(InvalidInputError);
    expect(deps.engine.calls).toEqual([]);
  });

  it("refuses an unknown run", async () => {
    const deps = await setup();
    await expect(resumeRun(deps, "nope", { decision: "approve" })).rejects.toBeInstanceOf(NotFoundError);
  });
});
