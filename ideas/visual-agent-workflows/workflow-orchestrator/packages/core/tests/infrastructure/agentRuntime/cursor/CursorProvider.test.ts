import type { AgentOptions, Run, RunResult, SDKAgent, SDKMessage } from "@cursor/sdk";
import { describe, expect, it } from "vitest";
import type { StepEvent } from "../../../../src/domain/runState";
import { type CursorSdk, CursorProvider } from "../../../../src/infrastructure/agentRuntime/cursor/CursorProvider";

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

function fakeSdk(run: Run, getRunError?: Error, sendError?: Error) {
  const created: AgentOptions[] = [];
  const sent: { message: unknown; options: unknown }[] = [];
  let closed = 0;
  const sdk: CursorSdk = {
    create: async (options) => {
      created.push(options);
      return {
        agentId: "agent-1",
        send: async (message: unknown, sendOptions: unknown) => {
          sent.push({ message, options: sendOptions });
          if (sendError) throw sendError;
          return run;
        },
        close: () => {
          closed++;
        },
      } as unknown as SDKAgent;
    },
    getRun: async () => {
      if (getRunError) throw getRunError;
      return run;
    },
  };
  return { sdk, created, sent, closed: () => closed };
}

async function collect(events: AsyncIterable<StepEvent>) {
  const all: StepEvent[] = [];
  for await (const event of events) all.push(event);
  return all;
}

describe("CursorProvider.open", () => {
  it("creates a local agent in the project with its own settings, and sends with the idempotency key", async () => {
    const { sdk, created, sent } = fakeSdk(fakeRun());

    await new CursorProvider({ apiKey: KEY, sdk }).open(request);

    expect(created).toEqual([
      { apiKey: KEY, model: { id: "composer-2.5" }, local: { cwd: "/host", settingSources: ["project"] }, tools: ["read", "edit", "delete", "grep", "glob", "ls"] },
    ]);
    expect(sent).toEqual([{ message: "Do it", options: { idempotencyKey: "run-1:elicit:1" } }]);
  });

  it("offers no shell, MCP, web or subagent tools", async () => {
    const { sdk, created } = fakeSdk(fakeRun());
    await new CursorProvider({ apiKey: KEY, sdk }).open(request);
    for (const tool of ["shell", "mcp", "webFetch", "webSearch", "task"]) expect(created[0]?.tools).not.toContain(tool);
  });

  it("cancels the SDK run", async () => {
    let cancelled = 0;
    const run = { ...fakeRun(), cancel: async () => void cancelled++ } as Run;
    const { sdk } = fakeSdk(run);

    await (await new CursorProvider({ apiKey: KEY, sdk }).open(request)).cancel();

    expect(cancelled).toBe(1);
  });

  it("closes the agent when sending the message fails", async () => {
    const { sdk, closed } = fakeSdk(fakeRun(), undefined, new Error("rate limited"));

    await expect(new CursorProvider({ apiKey: KEY, sdk }).open(request)).rejects.toThrow("rate limited");

    expect(closed()).toBe(1);
  });

  it("maps the stream to step events and the result, then closes the agent", async () => {
    const messages: SDKMessage[] = [{ type: "tool_call", agent_id: "a", run_id: "r", call_id: "c", name: "edit", status: "running" }];
    const { sdk, closed } = fakeSdk(fakeRun({ messages, result: { result: "Wrote it", durationMs: 10 } }));

    const run = await new CursorProvider({ apiKey: KEY, sdk }).open(request);

    expect(run.id).toBe("agent-run-1");
    expect(await collect(run.events())).toEqual([{ kind: "tool", callId: "c", name: "edit", status: "running" }]);
    expect(await run.result()).toEqual({ status: "finished", summary: "Wrote it", durationMs: 10 });
    expect(closed()).toBe(1);
  });
});

describe("CursorProvider.find", () => {
  it("returns a finished run with its real result", async () => {
    const found = await new CursorProvider({ apiKey: KEY, sdk: fakeSdk(fakeRun({ result: { result: "from before" } })).sdk }).find("agent-run-1", "/host");
    if (!found || found === "cut-off") throw new Error("expected a run");
    expect((await found.result()).summary).toBe("from before");
  });

  it("says a run still marked running was cut off", async () => {
    expect(await new CursorProvider({ apiKey: KEY, sdk: fakeSdk(fakeRun({ status: "running" })).sdk }).find("x", "/host")).toBe("cut-off");
  });

  it("returns null when the run can't be found, and rethrows other errors", async () => {
    const notFound = Object.assign(new Error("run not found"), { status: 404 });
    expect(await new CursorProvider({ apiKey: KEY, sdk: fakeSdk(fakeRun(), notFound).sdk }).find("x", "/host")).toBeNull();
    await expect(new CursorProvider({ apiKey: KEY, sdk: fakeSdk(fakeRun(), new Error("network down")).sdk }).find("x", "/host")).rejects.toThrow("network down");
  });
});
