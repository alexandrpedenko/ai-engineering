import { describe, expect, it } from "vitest";
import { listRuns } from "../../src/application/listRuns";
import type { RunOutcome } from "../../src/application/RunEngine";
import { FakeRunEngine } from "../support/FakeRunEngine";
import { MemoryRunFiles, savedRun } from "../support/MemoryRunFiles";
import { baWorkflow } from "../support/workflows";

describe("listRuns", () => {
  it("lists runs newest first with their status, filtered by workflow when asked", async () => {
    const engine = new FakeRunEngine();
    engine.outcomeOf = { status: "waiting", gateId: "review", shows: [], state: {} } as unknown as RunOutcome;
    const runFiles = new MemoryRunFiles();
    await runFiles.saveRun("run-a", savedRun(baWorkflow(), {}, "2026-10-10T00:00:00.000Z"));
    await runFiles.saveRun("run-b", savedRun(baWorkflow((w) => Object.assign(w, { id: "other" })), {}, "2026-10-11T00:00:00.000Z"));
    const deps = { engine, runFiles, isBusy: (id: string) => id === "run-b" };

    expect(await listRuns(deps)).toEqual([
      { runId: "run-b", workflowId: "other", startedAt: "2026-10-11T00:00:00.000Z", status: "waiting", busy: true },
      { runId: "run-a", workflowId: "ba-discovery", startedAt: "2026-10-10T00:00:00.000Z", status: "waiting", busy: false },
    ]);
    expect((await listRuns(deps, "ba-discovery")).map((r) => r.runId)).toEqual(["run-a"]);
  });

  it("calls a run the engine has no state for yet 'starting'", async () => {
    const runFiles = new MemoryRunFiles();
    await runFiles.saveRun("run-a", savedRun(baWorkflow()));
    expect((await listRuns({ engine: new FakeRunEngine(), runFiles, isBusy: () => true }))[0]?.status).toBe("starting");
  });
});
