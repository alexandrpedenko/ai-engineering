import { describe, expect, it } from "vitest";
import { continueRun } from "../../src/application/continueRun";
import { NotFoundError } from "../../src/application/errors";
import { FakeRunEngine } from "../support/FakeRunEngine";
import { MemoryRunFiles, savedRun } from "../support/MemoryRunFiles";
import { baWorkflow } from "../support/workflows";

describe("continueRun", () => {
  it("continues the run against the workflow it started with", async () => {
    const engine = new FakeRunEngine();
    const runFiles = new MemoryRunFiles();
    await runFiles.saveRun("run-1", savedRun(baWorkflow()));

    await continueRun({ engine, runFiles }, "run-1");

    expect(engine.calls).toEqual([{ method: "continue", runId: "run-1", workflowId: "ba-discovery" }]);
  });

  it("refuses an unknown run", async () => {
    await expect(continueRun({ engine: new FakeRunEngine(), runFiles: new MemoryRunFiles() }, "nope")).rejects.toBeInstanceOf(NotFoundError);
  });
});
