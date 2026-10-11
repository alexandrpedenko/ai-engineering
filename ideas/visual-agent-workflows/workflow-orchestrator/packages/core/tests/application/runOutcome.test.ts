import { describe, expect, it } from "vitest";
import { NotFoundError } from "../../src/application/errors";
import type { RunOutcome } from "../../src/application/RunEngine";
import { runOutcome } from "../../src/application/runOutcome";
import { FakeRunEngine } from "../support/FakeRunEngine";
import { MemoryRunFiles, savedRun } from "../support/MemoryRunFiles";
import { baWorkflow } from "../support/workflows";

async function setup() {
  const engine = new FakeRunEngine();
  const runFiles = new MemoryRunFiles();
  await runFiles.saveRun("run-1", savedRun(baWorkflow()));
  return { engine, runFiles };
}

describe("runOutcome", () => {
  it("returns the engine's outcome for the run", async () => {
    const deps = await setup();
    deps.engine.outcomeOf = { status: "waiting", gateId: "review", shows: [], state: {} } as unknown as RunOutcome;

    expect(await runOutcome(deps, "run-1")).toMatchObject({ status: "waiting", gateId: "review" });
  });

  it("throws NotFoundError when the run or its state is missing", async () => {
    const deps = await setup();
    await expect(runOutcome(deps, "nope")).rejects.toBeInstanceOf(NotFoundError);
    await expect(runOutcome(deps, "run-1")).rejects.toBeInstanceOf(NotFoundError);
  });
});
