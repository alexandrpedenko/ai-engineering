import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
  agentRunId: "agent-abc",
  before: { hashes: { "a.md": "h" }, matches: { "a.md": ["a.md"] } },
  baseTree: "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
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

  it("reads a ref saved without a base tree as having none", async () => {
    const { baseTree: _, ...old } = ref;
    await mkdir(join(dataDir, "runs/run-1/refs"), { recursive: true });
    await writeFile(join(dataDir, "runs/run-1/refs/elicit-2.json"), JSON.stringify(old));

    expect(await new FsRunFiles(dataDir).getRef("run-1", "elicit", 2)).toEqual({ ...ref, baseTree: null });
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

  it("writes a format version and no temporary files", async () => {
    const files = new FsRunFiles(dataDir);
    await files.saveRun("run-1", { workflow: baWorkflow(), inputs: {}, startedAt: "2026-10-11T12:00:00.000Z" });
    await files.putRef(ref);

    expect(JSON.parse(await readFile(join(dataDir, "runs/run-1/run.json"), "utf8")).formatVersion).toBe(1);
    expect(JSON.parse(await readFile(join(dataDir, "runs/run-1/refs/elicit-2.json"), "utf8")).formatVersion).toBe(1);
    expect(await readdir(join(dataDir, "runs/run-1"))).toEqual(["refs", "run.json"]);
  });

  it("reads a ref with the old agent run id name", async () => {
    const { agentRunId, ...rest } = ref;
    await mkdir(join(dataDir, "runs/run-1/refs"), { recursive: true });
    await writeFile(join(dataDir, "runs/run-1/refs/elicit-2.json"), JSON.stringify({ ...rest, cursorRunId: agentRunId }));

    expect(await new FsRunFiles(dataDir).getRef("run-1", "elicit", 2)).toEqual(ref);
  });

  it("leaves an unreadable run out of the list and reports it", async () => {
    const reported: unknown[] = [];
    const files = new FsRunFiles(dataDir, (error) => reported.push(error));
    await files.saveRun("run-good", { workflow: baWorkflow(), inputs: {}, startedAt: "2026-10-11T12:00:00.000Z" });
    await mkdir(join(dataDir, "runs/run-torn"), { recursive: true });
    await writeFile(join(dataDir, "runs/run-torn/run.json"), '{"workflow": {');

    expect((await files.listRuns()).map((r) => r.runId)).toEqual(["run-good"]);
    expect(String(reported[0])).toMatch(/run "run-torn" can't be read: .*run\.json is not valid JSON/);
  });

  it("refuses a ref whose base tree isn't a git object id", async () => {
    await mkdir(join(dataDir, "runs/run-1/refs"), { recursive: true });
    await writeFile(join(dataDir, "runs/run-1/refs/elicit-2.json"), JSON.stringify({ ...ref, baseTree: "--output=/tmp/x" }));

    await expect(new FsRunFiles(dataDir).getRef("run-1", "elicit", 2)).rejects.toThrow();
  });

  it("deletes everything kept about a run", async () => {
    const files = new FsRunFiles(dataDir);
    await files.saveRun("run-1", { workflow: baWorkflow(), inputs: {}, startedAt: "" });
    await files.putRef(ref);

    await files.deleteRun("run-1");

    expect(await files.loadRun("run-1")).toBeNull();
    expect(await files.listRuns()).toEqual([]);
  });
});
