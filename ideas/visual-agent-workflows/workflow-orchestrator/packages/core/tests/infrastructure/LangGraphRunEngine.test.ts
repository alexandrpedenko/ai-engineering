import { MemorySaver } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";
import { ConflictError } from "../../src/application/errors";
import { runAgentStep } from "../../src/application/runAgentStep";
import { FakeAgentRuntime, type FakeReply } from "../../src/infrastructure/FakeAgentRuntime";
import { LangGraphRunEngine } from "../../src/infrastructure/LangGraphRunEngine";
import { agentDeps } from "../support/agentDeps";
import type { MemoryRunFiles } from "../support/MemoryRunFiles";
import { baWorkflow } from "../support/workflows";

// An engine on a fake agent and an in-memory checkpointer. Pass the same
// checkpointer and run files to a second engine to simulate a server restart.
function setup(replies: FakeReply[] = [{}], shared?: { checkpointer: MemorySaver; runFiles: MemoryRunFiles; runtime?: FakeAgentRuntime }) {
  const runtime = shared?.runtime ?? new FakeAgentRuntime(replies);
  const { deps, events, runFiles } = agentDeps(runtime, shared ? { runFiles: shared.runFiles } : {});
  const checkpointer = shared?.checkpointer ?? new MemorySaver();
  const engine = new LangGraphRunEngine({
    checkpointer,
    agentStep: async (runId, step, state) => await runAgentStep(deps, runId, step, state),
    onEvent: deps.onEvent,
  });
  const stepsRun = () => runtime.requests.map((r) => r.key.split(":")[1]);
  return { engine, runtime, events, checkpointer, runFiles: runFiles as MemoryRunFiles, stepsRun };
}

const inputs = { focus: "pricing" };

describe("LangGraphRunEngine", () => {
  it("runs to the first gate and waits there", async () => {
    const { engine, events, stepsRun } = setup();

    const outcome = await engine.start("run-1", baWorkflow(), inputs);

    expect(outcome).toMatchObject({ status: "waiting", gateId: "review", shows: ["discovery/requirements.md"] });
    expect(stepsRun()).toEqual(["elicit"]);
    expect(outcome.state.steps.elicit?.status).toBe("done");
    expect(events.map((e) => e.type)).toEqual(["step-started", "step-finished", "gate-waiting"]);
  });

  it("goes on to the next step on approve and finishes", async () => {
    const { engine, stepsRun } = setup();
    await engine.start("run-1", baWorkflow(), inputs);

    const outcome = await engine.resume("run-1", baWorkflow(), { decision: "approve" });

    expect(outcome.status).toBe("finished");
    expect(stepsRun()).toEqual(["elicit", "design"]);
    expect(outcome.state.decisions.review).toEqual([{ decision: "approve" }]);
  });

  it("sends the work back on reject, with the feedback in the next message", async () => {
    const { engine, runtime, stepsRun } = setup();
    await engine.start("run-1", baWorkflow(), inputs);

    const outcome = await engine.resume("run-1", baWorkflow(), { decision: "reject", feedback: "add acceptance checks" });

    expect(outcome).toMatchObject({ status: "waiting", gateId: "review" });
    expect(stepsRun()).toEqual(["elicit", "elicit"]);
    expect(runtime.requests[0]?.message).not.toContain("Reviewer feedback");
    expect(runtime.requests[1]?.message).toContain("# Reviewer feedback on your previous attempt\n1. add acceptance checks");
    expect(runtime.requests[1]?.key).toBe("run-1:elicit:2");
    expect(outcome.state.steps.elicit?.cursorRunIds).toEqual(["fake-run-1", "fake-run-2"]);
    expect(outcome.state.revisions.review).toBe(1);
  });

  it("ends the run as rejected when a gate runs out of revisions", async () => {
    const { engine, stepsRun } = setup();
    const workflow = baWorkflow((w) => Object.assign(w.steps[1]!, { maxRevisions: 1 }));
    await engine.start("run-1", workflow, inputs);
    await engine.resume("run-1", workflow, { decision: "reject", feedback: "first" });

    const outcome = await engine.resume("run-1", workflow, { decision: "reject", feedback: "second" });

    expect(outcome).toMatchObject({ status: "rejected", gateId: "review" });
    expect(stepsRun()).toEqual(["elicit", "elicit"]);
    expect(outcome.state.feedback.elicit).toEqual(["first"]);
  });

  it("stops at a failing agent step and runs nothing after it", async () => {
    const { engine, stepsRun } = setup([{ status: "error", summary: "model refused" }]);

    const outcome = await engine.start("run-1", baWorkflow(), inputs);

    expect(outcome).toMatchObject({ status: "failed", stepId: "elicit" });
    expect(outcome.state.steps.elicit?.summary).toBe("model refused");
    expect(stepsRun()).toEqual(["elicit"]);
  });

  it("forwards the agent's events while it works", async () => {
    const { engine, events } = setup([{ events: [{ kind: "text", text: "Reading the brief" }, { kind: "tool", callId: "c1", name: "edit", status: "completed" }] }]);

    await engine.start("run-1", baWorkflow(), inputs);

    expect(events.filter((e) => e.type === "agent-event")).toEqual([
      { type: "agent-event", stepId: "elicit", event: { kind: "text", text: "Reading the brief" } },
      { type: "agent-event", stepId: "elicit", event: { kind: "tool", callId: "c1", name: "edit", status: "completed" } },
    ]);
  });

  it("resumes a waiting run from a new engine on the same checkpointer", async () => {
    const first = setup();
    await first.engine.start("run-1", baWorkflow(), inputs);

    const second = setup([{}], { checkpointer: first.checkpointer, runFiles: first.runFiles });
    expect(await second.engine.outcome("run-1", baWorkflow())).toMatchObject({ status: "waiting", gateId: "review" });
    const outcome = await second.engine.resume("run-1", baWorkflow(), { decision: "approve" });

    expect(outcome.status).toBe("finished");
    expect(second.stepsRun()).toEqual(["design"]);
  });

  it("refuses to resume a run that isn't waiting, and to start one twice", async () => {
    const { engine } = setup();
    await engine.start("run-1", baWorkflow(), inputs);
    await engine.resume("run-1", baWorkflow(), { decision: "approve" });

    await expect(engine.resume("run-1", baWorkflow(), { decision: "approve" })).rejects.toBeInstanceOf(ConflictError);
    await expect(engine.start("run-1", baWorkflow(), inputs)).rejects.toBeInstanceOf(ConflictError);
    await expect(engine.resume("nope", baWorkflow(), { decision: "approve" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("reports a run whose process stopped inside a step as interrupted", async () => {
    const { engine } = setup([{ dies: true }]);

    await expect(engine.start("run-1", baWorkflow(), inputs)).rejects.toThrow("fake process stopped");

    expect(await engine.outcome("run-1", baWorkflow())).toMatchObject({ status: "interrupted", stepId: "elicit" });
  });

  it("continues an interrupted run by reattaching, so the agent runs only once", async () => {
    const first = setup([{ dies: true, summary: "requirements written" }]);
    await expect(first.engine.start("run-1", baWorkflow(), inputs)).rejects.toThrow();

    const second = setup([{}], { checkpointer: first.checkpointer, runFiles: first.runFiles, runtime: first.runtime });
    const outcome = await second.engine.continue("run-1", baWorkflow());

    expect(outcome).toMatchObject({ status: "waiting", gateId: "review" });
    expect(outcome.state.steps.elicit).toMatchObject({ status: "done", summary: "requirements written", cursorRunIds: ["fake-run-1"] });
    expect(first.runtime.requests).toHaveLength(1);
  });

  it("refuses to continue a run that isn't interrupted", async () => {
    const { engine } = setup();
    await engine.start("run-1", baWorkflow(), inputs);

    await expect(engine.continue("run-1", baWorkflow())).rejects.toBeInstanceOf(ConflictError);
  });

  it("retries a failed step as a new attempt and goes on from there", async () => {
    const { engine, stepsRun } = setup([{ status: "error", summary: "rate limited" }, {}]);
    await engine.start("run-1", baWorkflow(), inputs);

    const outcome = await engine.retry("run-1", baWorkflow());

    expect(outcome).toMatchObject({ status: "waiting", gateId: "review" });
    expect(stepsRun()).toEqual(["elicit", "elicit"]);
    expect(outcome.state.steps.elicit).toMatchObject({ status: "done", cursorRunIds: ["fake-run-1", "fake-run-2"] });
  });

  it("retries a step that failed after the gate, keeping the steps before it", async () => {
    const { engine, stepsRun, runtime } = setup([{}, { status: "error" }, {}]);
    await engine.start("run-1", baWorkflow(), inputs);
    expect(await engine.resume("run-1", baWorkflow(), { decision: "approve" })).toMatchObject({ status: "failed", stepId: "design" });

    const outcome = await engine.retry("run-1", baWorkflow());

    expect(outcome.status).toBe("finished");
    expect(stepsRun()).toEqual(["elicit", "design", "design"]);
    expect(runtime.requests[2]?.key).toBe("run-1:design:2");
  });

  it("ends a run whose agent can't be started as failed, and a retry works once it can", async () => {
    const { engine, stepsRun } = setup([{ startFails: "plan required" }, {}]);

    const failed = await engine.start("run-1", baWorkflow(), inputs);
    expect(failed).toMatchObject({ status: "failed", stepId: "elicit" });
    expect(failed.state.steps.elicit?.summary).toBe("couldn't start the agent: plan required");

    const retried = await engine.retry("run-1", baWorkflow());
    expect(retried).toMatchObject({ status: "waiting", gateId: "review" });
    expect(stepsRun()).toEqual(["elicit", "elicit"]);
  });

  it("refuses to retry a run that isn't failed", async () => {
    const { engine } = setup();
    await expect(engine.retry("nope", baWorkflow())).rejects.toBeInstanceOf(ConflictError);
    await engine.start("run-1", baWorkflow(), inputs);
    await expect(engine.retry("run-1", baWorkflow())).rejects.toThrow(/is waiting, not failed/);
  });

  it("reports a crash during a retry as interrupted, not failed", async () => {
    const { engine } = setup([{ status: "error" }, { dies: true }]);
    await engine.start("run-1", baWorkflow(), inputs);

    await expect(engine.retry("run-1", baWorkflow())).rejects.toThrow("fake process stopped");

    expect(await engine.outcome("run-1", baWorkflow())).toMatchObject({ status: "interrupted", stepId: "elicit" });
  });

  it("knows no outcome for a run that doesn't exist", async () => {
    expect(await setup().engine.outcome("nope", baWorkflow())).toBeNull();
  });
});
