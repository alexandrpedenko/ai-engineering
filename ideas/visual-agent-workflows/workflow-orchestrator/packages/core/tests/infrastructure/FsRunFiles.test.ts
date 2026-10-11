import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsRunFiles } from "../../src/infrastructure/FsRunFiles";
import { baWorkflow } from "../support/workflows";

let dataDir: string;
beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "orch-data-"));
});
afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

const ref = {
  runId: "run-1",
  stepId: "elicit",
  attempt: 2,
  cursorRunId: "agent-abc",
  before: { hashes: { "a.md": "h" }, matches: { "a.md": ["a.md"] } },
  startedAt: "2026-10-11T12:00:00.000Z",
};

describe("FsRunFiles", () => {
  it("saves and loads a run's workflow and inputs", async () => {
    const files = new FsRunFiles(dataDir);
    const run = { workflow: baWorkflow(), inputs: { focus: "pricing" }, startedAt: "2026-10-11T12:00:00.000Z" };
    await files.saveRun("run-1", run);

    expect(await new FsRunFiles(dataDir).loadRun("run-1")).toEqual(run);
  });

  it("saves and finds a run ref by step and attempt", async () => {
    const files = new FsRunFiles(dataDir);
    await files.putRef(ref);

    expect(await files.getRef("run-1", "elicit", 2)).toEqual(ref);
    expect(await files.getRef("run-1", "elicit", 1)).toBeNull();
  });

  it("lists runs newest first, and nothing when there are none", async () => {
    const files = new FsRunFiles(dataDir);
    expect(await files.listRuns()).toEqual([]);
    await files.saveRun("run-old", { workflow: baWorkflow(), inputs: {}, startedAt: "2026-10-10T09:00:00.000Z" });
    await files.saveRun("run-new", { workflow: baWorkflow(), inputs: {}, startedAt: "2026-10-11T09:00:00.000Z" });
    await files.putRef(ref);

    expect(await files.listRuns()).toEqual([
      { runId: "run-new", workflowId: "ba-discovery", startedAt: "2026-10-11T09:00:00.000Z" },
      { runId: "run-old", workflowId: "ba-discovery", startedAt: "2026-10-10T09:00:00.000Z" },
    ]);
  });

  it("returns null for an unknown run", async () => {
    expect(await new FsRunFiles(dataDir).loadRun("nope")).toBeNull();
  });

  it("refuses a run id that could escape the data folder", async () => {
    await expect(new FsRunFiles(dataDir).loadRun("../etc")).rejects.toThrow("invalid run id");
  });
});
