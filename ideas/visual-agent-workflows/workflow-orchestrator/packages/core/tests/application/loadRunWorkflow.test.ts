import { describe, expect, it } from "vitest";
import { NotFoundError } from "../../src/application/errors";
import { loadRunWorkflow } from "../../src/application/loadRunWorkflow";
import { MemoryRunFiles, savedRun } from "../support/MemoryRunFiles";
import { baWorkflow } from "../support/workflows";

describe("loadRunWorkflow", () => {
  it("returns the workflow saved with the run", async () => {
    const runFiles = new MemoryRunFiles();
    await runFiles.saveRun("run-1", savedRun(baWorkflow()));
    expect(await loadRunWorkflow(runFiles, "run-1")).toEqual(baWorkflow());
  });

  it("throws NotFoundError for an unknown run", async () => {
    await expect(loadRunWorkflow(new MemoryRunFiles(), "nope")).rejects.toThrow(new NotFoundError('no run "nope"'));
  });
});
