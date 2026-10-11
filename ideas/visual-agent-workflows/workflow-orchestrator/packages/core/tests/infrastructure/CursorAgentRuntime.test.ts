import type { AgentOptions, Run, RunResult, SDKAgent, SDKMessage } from "@cursor/sdk";
import { describe, expect, it } from "vitest";
import type { StepEvent } from "../../src/domain/runState";
import { CursorAgentRuntime, type CursorSdk } from "../../src/infrastructure/CursorAgentRuntime";

const KEY = "crsr_secret_key";
const request = { cwd: "/host", model: { id: "composer-2.5" }, message: "Do it", key: "run-1:elicit:1" };

// A Run that streams the given messages and finishes with the given result.
function fakeRun(options: { messages?: SDKMessage[]; result?: Partial<RunResult>; status?: Run["status"] } = {}): Run {
  return {
    id: "agent-run-1",
    agentId: "agent-1",
    status: options.status ?? "finished",
    supports: () => true,
    unsupportedReason: () => undefined,
    stream: async function* () {
      for (const message of options.messages ?? []) yield message;
    },
    conversation: async () => [],
    wait: async () => ({ id: "agent-run-1", status: "finished", result: "done", ...options.result }),
    cancel: async () => {},
    onDidChangeStatus: () => () => {},
  } as Run;
}

function fakeSdk(run: Run, failWith?: Error) {
  const created: AgentOptions[] = [];
  const sent: { message: unknown; options: unknown }[] = [];
  let closed = 0;
  const sdk: CursorSdk = {
    create: async (options) => {
      if (failWith) throw failWith;
      created.push(options);
      return {
        agentId: "agent-1",
        send: async (message: unknown, sendOptions: unknown) => {
          sent.push({ message, options: sendOptions });
          return run;
        },
        close: () => {
          closed++;
        },
      } as unknown as SDKAgent;
    },
    getRun: async () => run,
  };
  return { sdk, created, sent, closed: () => closed };
}

async function collect(events: AsyncIterable<StepEvent>) {
  const all: StepEvent[] = [];
  for await (const event of events) all.push(event);
  return all;
}

describe("CursorAgentRuntime.start", () => {
  it("creates a local agent in the project with its own settings, and sends with the idempotency key", async () => {
    const { sdk, created, sent } = fakeSdk(fakeRun());

    await new CursorAgentRuntime({ apiKey: KEY, sdk }).start(request);

    expect(created).toEqual([{ apiKey: KEY, model: { id: "composer-2.5" }, local: { cwd: "/host", settingSources: ["project"] } }]);
    expect(sent).toEqual([{ message: "Do it", options: { idempotencyKey: "run-1:elicit:1" } }]);
  });

  it("maps the stream to step events and the result, then closes the agent", async () => {
    const messages: SDKMessage[] = [{ type: "tool_call", agent_id: "a", run_id: "r", call_id: "c", name: "edit", status: "running" }];
    const { sdk, closed } = fakeSdk(fakeRun({ messages, result: { result: "Wrote it", durationMs: 10 } }));

    const handle = await new CursorAgentRuntime({ apiKey: KEY, sdk }).start(request);

    expect(handle.id).toBe("agent-run-1");
    expect(await collect(handle.events())).toEqual([{ kind: "tool", callId: "c", name: "edit", status: "running" }]);
    expect(await handle.wait()).toEqual({ status: "finished", summary: "Wrote it", durationMs: 10 });
    expect(closed()).toBe(1);
  });

  it("never lets the API key out in an error", async () => {
    const { sdk } = fakeSdk(fakeRun(), new Error(`auth failed for ${KEY}`));

    await expect(new CursorAgentRuntime({ apiKey: KEY, sdk }).start(request)).rejects.toThrow("auth failed for [redacted]");
  });
});

describe("CursorAgentRuntime.attach", () => {
  it("returns a finished run's real result", async () => {
    const { sdk } = fakeSdk(fakeRun({ result: { result: "from before" } }));

    const handle = await new CursorAgentRuntime({ apiKey: KEY, sdk }).attach("agent-run-1", "/host");

    expect((await handle?.wait())?.summary).toBe("from before");
  });

  it("reports a run still marked running as cut off with its process", async () => {
    const { sdk } = fakeSdk(fakeRun({ status: "running" }));

    const handle = await new CursorAgentRuntime({ apiKey: KEY, sdk }).attach("agent-run-1", "/host");

    expect(await handle?.wait()).toEqual({ status: "error", summary: "the agent run was interrupted (its process stopped)", durationMs: 0 });
  });

  it("returns null when the run can't be found, and rethrows other errors", async () => {
    const notFound = Object.assign(new Error("run not found"), { status: 404 });
    const missing: CursorSdk = { create: async () => ({}) as SDKAgent, getRun: async () => { throw notFound; } };
    const broken: CursorSdk = { create: async () => ({}) as SDKAgent, getRun: async () => { throw new Error("network down"); } };

    expect(await new CursorAgentRuntime({ apiKey: KEY, sdk: missing }).attach("x", "/host")).toBeNull();
    await expect(new CursorAgentRuntime({ apiKey: KEY, sdk: broken }).attach("x", "/host")).rejects.toThrow("network down");
  });
});
