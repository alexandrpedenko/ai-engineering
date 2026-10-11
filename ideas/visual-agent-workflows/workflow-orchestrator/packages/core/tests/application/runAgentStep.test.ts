import { describe, expect, it } from "vitest";
import { runAgentStep } from "../../src/application/runAgentStep";
import type { RunEvent, RunState } from "../../src/domain/runState";
import type { AgentStep } from "../../src/domain/workflow";
import { FakeAgentRuntime, type FakeReply } from "../../src/infrastructure/FakeAgentRuntime";
import { baWorkflow, registry } from "../support/workflows";

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
  const events: RunEvent[] = [];
  const deps = {
    runtime,
    registry,
    cwd: "/host",
    defaultModel: { id: "composer-2.5" },
    doNotTouch: ["workflow-orchestrator/"],
    onEvent: (_: string, event: RunEvent) => events.push(event),
  };
  return { deps, runtime, events };
}

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

    expect(record).toEqual({
      status: "done",
      cursorRunIds: ["fake-run-1"],
      writes: [],
      missing: [],
      summary: "Wrote 12 requirements",
      usage: { inputTokens: 900, outputTokens: 400 },
      durationMs: 0,
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
});
