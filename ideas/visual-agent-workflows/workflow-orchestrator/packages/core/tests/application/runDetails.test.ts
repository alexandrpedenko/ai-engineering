import { describe, expect, it } from "vitest";
import { NotFoundError } from "../../src/application/errors";
import { runDetails } from "../../src/application/runDetails";
import { FakeRunEngine } from "../support/FakeRunEngine";
import { MemoryRunFiles, savedRun } from "../support/MemoryRunFiles";
import { baWorkflow } from "../support/workflows";

describe("runDetails", () => {
  it("returns the run as started, whether it's busy, and its outcome", async () => {
    const runFiles = new MemoryRunFiles();
    await runFiles.saveRun("run-1", savedRun(baWorkflow(), { focus: "x" }));

    const details = await runDetails({ engine: new FakeRunEngine(), runFiles, isBusy: () => false }, "run-1");

    expect(details).toMatchObject({ runId: "run-1", inputs: { focus: "x" }, busy: false, outcome: null });
    expect(details.workflow.id).toBe("ba-discovery");
  });

  it("throws NotFoundError for an unknown run", async () => {
    await expect(runDetails({ engine: new FakeRunEngine(), runFiles: new MemoryRunFiles(), isBusy: () => false }, "nope")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
