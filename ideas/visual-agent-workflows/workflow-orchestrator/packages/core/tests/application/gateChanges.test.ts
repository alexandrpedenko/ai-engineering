import { describe, expect, it } from "vitest";
import { NotFoundError } from "../../src/application/errors";
import { gateChanges } from "../../src/application/gateChanges";
import type { RunOutcome } from "../../src/application/RunEngine";
import type { RunState, StepRecord } from "../../src/domain/runState";
import { FakeProjectFiles } from "../support/FakeProjectFiles";
import { FakeRunEngine } from "../support/FakeRunEngine";
import { MemoryRunFiles, savedRun } from "../support/MemoryRunFiles";
import { baWorkflow } from "../support/workflows";

const record = (baseTree: string, writes: StepRecord["writes"]): StepRecord => ({
  status: "done",
  agentRunIds: ["r1"],
  writes,
  missing: [],
  summary: "",
  durationMs: 0,
  baseTree,
});

const waiting = (steps: Record<string, StepRecord>): RunOutcome => {
  const state: RunState = { workflowId: "ba-discovery", inputs: {}, steps, feedback: {}, decisions: {}, revisions: {}, stoppedAt: null };
  return { status: "waiting", gateId: "review", shows: ["discovery/requirements.md"], state };
};

async function setup(outcome: RunOutcome | null) {
  const engine = new FakeRunEngine();
  engine.outcomeOf = outcome;
  const runFiles = new MemoryRunFiles();
  await runFiles.saveRun("run-1", savedRun(baWorkflow()));
  const projectFiles = new FakeProjectFiles();
  return { deps: { engine, runFiles, projectFiles }, projectFiles };
}

describe("gateChanges", () => {
  it("gives each file the gate shows with its change and its diff against the step's tree", async () => {
    const { deps, projectFiles } = await setup(waiting({ elicit: record("tree-1", [{ path: "discovery/requirements.md", change: "modified" }]) }));
    projectFiles.diffs.set("discovery/requirements.md", { path: "discovery/requirements.md", added: 2, removed: 1, diff: "@@ -1 +1,2 @@\n-a\n+b\n+c\n" });

    const files = await gateChanges(deps, "run-1", "review");

    expect(files).toEqual([{ path: "discovery/requirements.md", change: "modified", added: 2, removed: 1, diff: "@@ -1 +1,2 @@\n-a\n+b\n+c\n" }]);
    expect(projectFiles.diffCalls).toEqual([{ baseTree: "tree-1", paths: ["discovery/requirements.md"] }]);
  });

  it("diffs against the latest attempt's tree after a reject", async () => {
    const latest = { ...record("tree-2", [{ path: "discovery/requirements.md", change: "modified" }]), agentRunIds: ["r1", "r2"] };
    const { deps, projectFiles } = await setup(waiting({ elicit: latest }));

    await gateChanges(deps, "run-1", "review");

    expect(projectFiles.diffCalls[0]?.baseTree).toBe("tree-2");
  });

  it("throws NotFoundError for an unknown run, a run with no state, or a step that isn't a gate", async () => {
    const { deps } = await setup(waiting({}));
    await expect(gateChanges(deps, "nope", "review")).rejects.toBeInstanceOf(NotFoundError);
    await expect(gateChanges(deps, "run-1", "elicit")).rejects.toBeInstanceOf(NotFoundError);
    await expect(gateChanges(deps, "run-1", "ghost")).rejects.toBeInstanceOf(NotFoundError);

    const { deps: noState } = await setup(null);
    await expect(gateChanges(noState, "run-1", "review")).rejects.toBeInstanceOf(NotFoundError);
  });
});
