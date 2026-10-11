import { describe, expect, it } from "vitest";
import { NotFoundError } from "../../src/application/errors";
import { retryRun } from "../../src/application/retryRun";
import { FakeRunEngine } from "../support/FakeRunEngine";
import { MemoryRunFiles, savedRun } from "../support/MemoryRunFiles";
import { baWorkflow } from "../support/workflows";

describe("retryRun", () => {
  it("retries against the workflow the run started with", async () => {
    const engine = new FakeRunEngine();
    const runFiles = new MemoryRunFiles();
    await runFiles.saveRun("run-1", savedRun(baWorkflow()));

    await retryRun({ engine, runFiles }, "run-1");

    expect(engine.calls).toEqual([{ method: "retry", runId: "run-1", workflowId: "ba-discovery" }]);
  });

  it("refuses an unknown run", async () => {
    await expect(retryRun({ engine: new FakeRunEngine(), runFiles: new MemoryRunFiles() }, "nope")).rejects.toBeInstanceOf(NotFoundError);
  });
});
