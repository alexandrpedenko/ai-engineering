import { MemorySaver } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";
import { ConflictError, InvalidInputError, MissingCredentialsError, NotFoundError } from "../../src/application/errors";
import type { LoggedEvent } from "../../src/application/EventLog";
import { runAgentStep } from "../../src/application/runAgentStep";
import { RunSupervisor } from "../../src/application/RunSupervisor";
import { FakeAgentRuntime, type FakeReply } from "../../src/infrastructure/FakeAgentRuntime";
import { LangGraphRunEngine } from "../../src/infrastructure/LangGraphRunEngine";
import { agentDeps } from "../support/agentDeps";
import { MemoryEventLog } from "../support/MemoryEventLog";
import { MemoryWorkflowStore } from "../support/MemoryWorkflowStore";
import { baWorkflow, registry } from "../support/workflows";

// A supervisor over the real engine, a fake agent, and in-memory stores.
function setup(replies: FakeReply[] = [{}], options: { canRun?: boolean; failingEngine?: boolean } = {}) {
  const runtime = new FakeAgentRuntime(replies);
  const eventLog = new MemoryEventLog();
  const store = new MemoryWorkflowStore([baWorkflow()]);
  let ids = 0;
  // The engine and the agent step report to the supervisor, which is created after them.
  let supervisor: RunSupervisor | undefined;
  const { deps, runFiles } = agentDeps(runtime, {
    onEvent: (runId, event) => supervisor?.onEvent(runId, event),
    onHandle: (runId, handle) => supervisor?.onHandle(runId, handle),
  });
  const engine = new LangGraphRunEngine({
    checkpointer: new MemorySaver(),
    agentStep: async (runId, step, state) => {
      if (options.failingEngine) throw new Error("engine exploded");
      return await runAgentStep(deps, runId, step, state);
    },
    onEvent: (runId, event) => supervisor?.onEvent(runId, event),
  });
  supervisor = new RunSupervisor({
    engine,
    runFiles,
    eventLog,
    store,
    registry: async () => registry,
    newId: () => `run-${++ids}`,
    now: () => new Date("2026-10-11T12:00:00Z"),
    assertCanRun: () => {
      if (options.canRun === false) throw new MissingCredentialsError("CURSOR_API_KEY");
    },
  });
  return { supervisor, runtime, eventLog, store, runFiles };
}

const types = (events: LoggedEvent[]) => events.map((e) => e.event.type);

describe("RunSupervisor", () => {
  it("answers start before the run moves, then logs every event in order", async () => {
    const { supervisor, eventLog } = setup();

    const { runId } = await supervisor.start("ba-discovery", { focus: "pricing" });
    expect(supervisor.isBusy(runId)).toBe(true);
    await supervisor.settled(runId);

    const events = await eventLog.read(runId);
    expect(types(events)).toEqual(["step-started", "step-finished", "gate-waiting", "run-settled"]);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(events.at(-1)?.event).toMatchObject({ type: "run-settled", outcome: { status: "waiting", gateId: "review" } });
    expect(supervisor.isBusy(runId)).toBe(false);
  });

  it("refuses at once what can't run: unknown workflow, missing key", async () => {
    await expect(setup().supervisor.start("nope", {})).rejects.toBeInstanceOf(NotFoundError);
    await expect(setup([{}], { canRun: false }).supervisor.start("ba-discovery", {})).rejects.toBeInstanceOf(MissingCredentialsError);
  });

  it("resumes at the gate and keeps numbering the run's events", async () => {
    const { supervisor, eventLog } = setup();
    const { runId } = await supervisor.start("ba-discovery", {});
    await supervisor.settled(runId);

    await supervisor.resume(runId, { decision: "approve" });
    await supervisor.settled(runId);

    const events = await eventLog.read(runId, 4);
    expect(events[0]?.seq).toBe(5);
    expect(events.at(-1)?.event).toMatchObject({ type: "run-settled", outcome: { status: "finished" } });
  });

  it("refuses a bad decision, a run that isn't waiting, and a second operation while busy", async () => {
    const { supervisor } = setup([{ holds: true }]);
    const { runId } = await supervisor.start("ba-discovery", {});

    await expect(supervisor.resume(runId, { decision: "maybe" })).rejects.toBeInstanceOf(InvalidInputError);
    await expect(supervisor.resume(runId, { decision: "approve" })).rejects.toBeInstanceOf(ConflictError);
    await supervisor.cancel(runId);
    await supervisor.settled(runId);
    await expect(supervisor.resume(runId, { decision: "approve" })).rejects.toThrow(/is failed, not waiting/);
    await expect(supervisor.continue(runId)).rejects.toThrow(/is failed, not interrupted/);
  });

  it("cancels the agent step in progress: the step and the run end failed", async () => {
    const { supervisor, eventLog } = setup([{ holds: true }]);
    const { runId } = await supervisor.start("ba-discovery", {});

    await supervisor.cancel(runId);
    await supervisor.settled(runId);

    const last = (await eventLog.read(runId)).at(-1)?.event;
    expect(last).toMatchObject({ type: "run-settled", outcome: { status: "failed", stepId: "elicit" } });
    expect(last?.type === "run-settled" && last.outcome.state.steps.elicit?.summary).toBe("cancelled");
    await expect(supervisor.cancel(runId)).rejects.toBeInstanceOf(ConflictError);
  });

  it("settles a run whose agent can't be started as failed, not crashed", async () => {
    const { supervisor, eventLog } = setup([{ startFails: "plan required" }]);
    const { runId } = await supervisor.start("ba-discovery", {});
    await supervisor.settled(runId);

    const types = (await eventLog.read(runId)).map((e) => e.event.type);
    expect(types).not.toContain("run-crashed");
    expect((await eventLog.read(runId)).at(-1)?.event).toMatchObject({ type: "run-settled", outcome: { status: "failed" } });
  });

  it("logs run-crashed when the engine throws, and frees the run", async () => {
    const { supervisor, eventLog } = setup([{}], { failingEngine: true });
    const { runId } = await supervisor.start("ba-discovery", {});
    await supervisor.settled(runId);

    expect((await eventLog.read(runId)).at(-1)?.event).toEqual({ type: "run-crashed", message: "engine exploded" });
    expect(supervisor.isBusy(runId)).toBe(false);
  });

  it("continues an interrupted run", async () => {
    const { supervisor, eventLog, runtime } = setup([{ dies: true }]);
    const { runId } = await supervisor.start("ba-discovery", {});
    await supervisor.settled(runId);
    expect((await eventLog.read(runId)).at(-1)?.event.type).toBe("run-crashed");

    await supervisor.continue(runId);
    await supervisor.settled(runId);

    expect((await eventLog.read(runId)).at(-1)?.event).toMatchObject({ type: "run-settled", outcome: { status: "waiting" } });
    expect(runtime.requests).toHaveLength(1);
  });

  it("watch replays what was logged after `after`, then passes on live events, each once", async () => {
    const { supervisor } = setup();
    const { runId } = await supervisor.start("ba-discovery", {});
    await supervisor.settled(runId);

    const seen: number[] = [];
    const unsubscribe = await supervisor.watch(runId, 2, (e) => seen.push(e.seq));
    expect(seen).toEqual([3, 4]);

    await supervisor.resume(runId, { decision: "approve" });
    await supervisor.settled(runId);
    expect(seen.slice(0, 3)).toEqual([3, 4, 5]);
    expect(new Set(seen).size).toBe(seen.length);

    unsubscribe();
    const count = seen.length;
    supervisor.onEvent(runId, { type: "gate-waiting", gateId: "review", shows: [] });
    expect(seen.length).toBe(count);
  });

  it("retries a cancelled step in the background as attempt 2", async () => {
    const { supervisor, eventLog } = setup([{ holds: true }, {}]);
    const { runId } = await supervisor.start("ba-discovery", {});
    await supervisor.cancel(runId);
    await supervisor.settled(runId);

    await supervisor.retry(runId);
    await supervisor.settled(runId);

    const events = (await eventLog.read(runId)).map((e) => e.event);
    expect(events).toContainEqual({ type: "step-started", stepId: "elicit", attempt: 2 });
    expect(events.at(-1)).toMatchObject({ type: "run-settled", outcome: { status: "waiting" } });
  });

  it("refuses to retry a run that is moving or isn't failed", async () => {
    const holding = setup([{ holds: true }]);
    const { runId } = await holding.supervisor.start("ba-discovery", {});
    await expect(holding.supervisor.retry(runId)).rejects.toThrow(/busy/);
    await holding.supervisor.cancel(runId);
    await holding.supervisor.settled(runId);

    const waiting = setup();
    const second = await waiting.supervisor.start("ba-discovery", {});
    await waiting.supervisor.settled(second.runId);
    await expect(waiting.supervisor.retry(second.runId)).rejects.toThrow(/is waiting, not failed/);
  });

  it("watch refuses an unknown run", async () => {
    await expect(setup().supervisor.watch("nope", 0, () => {})).rejects.toBeInstanceOf(NotFoundError);
  });
});
