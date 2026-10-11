import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runAgentStep } from "../../src/application/runAgentStep";
import { OrchestratorConfig } from "../../src/domain/config";
import type { RunState } from "../../src/domain/runState";
import type { AgentStep } from "../../src/domain/workflow";
import { FakeAgentRuntime, type FakeReply } from "../../src/infrastructure/FakeAgentRuntime";
import { FsProjectFiles } from "../../src/infrastructure/FsProjectFiles";
import { agentDeps } from "../support/agentDeps";
import { copyOfSampleProject, orchestratorDir } from "../support/paths";
import { baWorkflow } from "../support/workflows";

const elicit = baWorkflow().steps[0] as AgentStep;
const emptyState: RunState = {
  workflowId: "ba-discovery",
  inputs: { focus: "pricing" },
  steps: {},
  feedback: {},
  decisions: {},
  revisions: {},
  stoppedAt: null,
};

function setup(reply: FakeReply = {}) {
  const runtime = new FakeAgentRuntime([reply]);
  return { runtime, ...agentDeps(runtime) };
}

const temps: string[] = [];
afterEach(async () => {
  await Promise.all(temps.splice(0).map(async (dir) => await rm(dir, { recursive: true, force: true })));
});

describe("runAgentStep", () => {
  it("sends the built message, the resolved model and an idempotency key", async () => {
    const { deps, runtime } = setup();

    await runAgentStep(deps, "run-1", elicit, emptyState);

    const [request] = runtime.requests;
    expect(request?.cwd).toBe("/host");
    expect(request?.model).toEqual({ id: "composer-2.5" });
    expect(request?.key).toBe("run-1:elicit:1");
    expect(request?.message).toMatch(/^# Your role\nYou are a business analyst\./);
    expect(request?.message).toContain("Focus: pricing");
  });

  it("returns a done record with the run id, summary and usage", async () => {
    const { deps } = setup({ summary: "Wrote 12 requirements", usage: { inputTokens: 900, outputTokens: 400 } });

    const record = await runAgentStep(deps, "run-1", elicit, emptyState);

    expect(record).toMatchObject({
      status: "done",
      cursorRunIds: ["fake-run-1"],
      summary: "Wrote 12 requirements",
      usage: { inputTokens: 900, outputTokens: 400 },
    });
  });

  it("marks the step failed when the agent errors", async () => {
    const { deps } = setup({ status: "error", summary: "boom" });
    expect((await runAgentStep(deps, "run-1", elicit, emptyState)).status).toBe("failed");
  });

  it("numbers the attempt from earlier runs and keeps their ids", async () => {
    const { deps, runtime } = setup();
    const state: RunState = {
      ...emptyState,
      steps: { elicit: { status: "done", cursorRunIds: ["old-1"], writes: [], missing: [], summary: "", durationMs: 0 } },
      feedback: { elicit: ["add checks"] },
    };

    const record = await runAgentStep(deps, "run-1", elicit, state);

    expect(runtime.requests[0]?.key).toBe("run-1:elicit:2");
    expect(runtime.requests[0]?.message).toContain("1. add checks");
    expect(record.cursorRunIds).toEqual(["old-1", "fake-run-1"]);
  });

  it("reports start, every agent event in order, and finish", async () => {
    const { deps, events } = setup({ events: [{ kind: "thinking", text: "hm" }, { kind: "text", text: "ok" }] });

    await runAgentStep(deps, "run-1", elicit, emptyState);

    expect(events.map((e) => (e.type === "agent-event" ? e.event.kind : e.type))).toEqual([
      "step-started",
      "thinking",
      "text",
      "step-finished",
    ]);
  });

  it("refuses an agent or skill that isn't in the project", async () => {
    const { deps } = setup();
    await expect(runAgentStep(deps, "run-1", { ...elicit, agent: "ghost" }, emptyState)).rejects.toThrow('agent "ghost"');
    await expect(runAgentStep(deps, "run-1", { ...elicit, skills: ["nope"] }, emptyState)).rejects.toThrow('skill "nope"');
  });

  it("snapshots the step's writes plus the artefact globs", async () => {
    const { deps, projectFiles } = setup();

    await runAgentStep(deps, "run-1", elicit, emptyState);

    expect(projectFiles.snapshotCalls).toEqual([
      ["discovery/requirements.md", "discovery/**"],
      ["discovery/requirements.md", "discovery/**"],
    ]);
  });

  it("reads what changed from disk, not from the agent", async () => {
    const root = await copyOfSampleProject();
    temps.push(root);
    const runtime = new FakeAgentRuntime([{ writes: { "discovery/requirements.md": "# R1\n" }, summary: "I wrote everything" }]);
    const config = { ...OrchestratorConfig.parse({}), orchestratorDir, projectRoot: root, dataDir: join(root, ".data") };
    const { deps } = agentDeps(runtime, { cwd: root, projectFiles: new FsProjectFiles(config) });
    const step: AgentStep = { ...elicit, writes: ["discovery/requirements.md", "discovery/glossary.md"] };

    const record = await runAgentStep(deps, "run-1", step, emptyState);

    expect(await readFile(join(root, "discovery/requirements.md"), "utf8")).toBe("# R1\n");
    expect(record.writes).toEqual([{ path: "discovery/requirements.md", change: "created" }]);
    expect(record.missing).toEqual(["discovery/glossary.md"]);
  });

  it("saves the run ref before waiting on the agent", async () => {
    const { deps, runFiles } = setup({ dies: true });

    await expect(runAgentStep(deps, "run-1", elicit, emptyState)).rejects.toThrow("fake process stopped");

    expect(runFiles.log).toEqual(["putRef elicit-1 fake-run-1"]);
    expect((await runFiles.getRef("run-1", "elicit", 1))?.before).toEqual({ hashes: {}, matches: {} });
  });

  it("reattaches to the agent run of an attempt that was already started", async () => {
    const { deps, runtime, events } = setup({ dies: true, summary: "first and only run" });
    await expect(runAgentStep(deps, "run-1", elicit, emptyState)).rejects.toThrow();
    events.length = 0;

    const record = await runAgentStep(deps, "run-1", elicit, emptyState);

    expect(runtime.requests).toHaveLength(1);
    expect(record).toMatchObject({ status: "done", cursorRunIds: ["fake-run-1"], summary: "first and only run" });
    expect(events.map((e) => e.type)).toEqual(["step-started", "step-finished"]);
  });

  it("reports a reattached run that was cut off as failed, without starting another", async () => {
    const { deps, runtime } = setup({ dies: true });
    await expect(runAgentStep(deps, "run-1", elicit, emptyState)).rejects.toThrow();
    runtime.cutOff("fake-run-1");

    const record = await runAgentStep(deps, "run-1", elicit, emptyState);

    expect(runtime.requests).toHaveLength(1);
    expect(record).toMatchObject({ status: "failed", summary: "the agent run was interrupted (its process stopped)" });
  });

  it("starts a new run when the ref's agent run can't be found", async () => {
    const { deps, runtime, runFiles } = setup();
    await runFiles.putRef({
      runId: "run-1",
      stepId: "elicit",
      attempt: 1,
      cursorRunId: "gone",
      before: { hashes: {}, matches: {} },
      startedAt: "2026-10-11T11:00:00Z",
    });

    const record = await runAgentStep(deps, "run-1", elicit, emptyState);

    expect(runtime.requests).toHaveLength(1);
    expect(record.cursorRunIds).toEqual(["fake-run-1"]);
  });
});
