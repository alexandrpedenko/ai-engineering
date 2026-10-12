import { describe, expect, it } from "vitest";
import type { AgentRunRequest, AgentRunResult } from "../../../src/application/AgentRuntime";
import type { AgentProvider, ProviderRun } from "../../../src/infrastructure/agentRuntime/AgentProvider";
import { INTERRUPTED_SUMMARY, ProviderAgentRuntime } from "../../../src/infrastructure/agentRuntime/ProviderAgentRuntime";

const KEY = "sk-secret";
const request: AgentRunRequest = { cwd: "/host", model: { id: "m" }, message: "Do it", key: "run-1:elicit:1" };

function providerRun(id: string, result: AgentRunResult = { status: "finished", summary: "ok", durationMs: 1 }): ProviderRun {
  return { id, events: async function* () {}, result: async () => result, cancel: async () => {} };
}

// A provider whose answers the test sets.
class FakeProvider implements AgentProvider {
  readonly name = "claude" as const;
  opened: AgentRunRequest[] = [];
  openError: Error | null = null;
  findAnswer: ProviderRun | "cut-off" | null = null;
  async open(req: AgentRunRequest) {
    this.opened.push(req);
    if (this.openError) throw this.openError;
    return providerRun(`run-${this.opened.length}`);
  }
  async find() {
    return this.findAnswer;
  }
}

describe("ProviderAgentRuntime", () => {
  it("starts a run through its provider and exposes it as a handle", async () => {
    const provider = new FakeProvider();
    const runtime = new ProviderAgentRuntime(provider, KEY);

    const handle = await runtime.start(request);

    expect(runtime.kind).toBe("claude");
    expect(provider.opened).toEqual([request]);
    expect(handle.id).toBe("run-1");
    expect(await handle.wait()).toEqual({ status: "finished", summary: "ok", durationMs: 1 });
  });

  it("removes the API key from errors", async () => {
    const provider = new FakeProvider();
    provider.openError = new Error(`bad key ${KEY}`);

    await expect(new ProviderAgentRuntime(provider, KEY).start(request)).rejects.toThrow("bad key [redacted]");
  });

  it("reattaches to a run it started, without asking the provider", async () => {
    const provider = new FakeProvider();
    provider.findAnswer = null;
    const runtime = new ProviderAgentRuntime(provider, KEY);
    await runtime.start(request);

    expect((await runtime.attach("run-1", "/host"))?.id).toBe("run-1");
  });

  it("reports a cut-off run as interrupted, and an unknown one as null", async () => {
    const provider = new FakeProvider();
    const runtime = new ProviderAgentRuntime(provider, KEY);

    provider.findAnswer = "cut-off";
    expect(await (await runtime.attach("old", "/host"))?.wait()).toEqual({ status: "error", summary: INTERRUPTED_SUMMARY, durationMs: 0 });

    provider.findAnswer = null;
    expect(await runtime.attach("old", "/host")).toBeNull();

    provider.findAnswer = providerRun("old", { status: "finished", summary: "from before", durationMs: 2 });
    expect((await (await runtime.attach("old", "/host"))?.wait())?.summary).toBe("from before");
  });

  it("forgets a run once its result has been read", async () => {
    const provider = new FakeProvider();
    const runtime = new ProviderAgentRuntime(provider, KEY);
    const handle = await runtime.start(request);
    provider.findAnswer = "cut-off";

    await handle.wait();

    expect(await (await runtime.attach(handle.id, "/host"))?.wait()).toMatchObject({ summary: INTERRUPTED_SUMMARY });
  });

  it("removes the key from errors while waiting and cancelling", async () => {
    const provider = new FakeProvider();
    provider.open = async () => ({
      id: "run-x",
      events: async function* () {},
      result: async () => {
        throw new Error(`denied for ${KEY}`);
      },
      cancel: async () => {
        throw new Error(`no cancel for ${KEY}`);
      },
    });
    const handle = await new ProviderAgentRuntime(provider, KEY).start(request);

    await expect(handle.wait()).rejects.toThrow("denied for [redacted]");
    await expect(handle.cancel()).rejects.toThrow("no cancel for [redacted]");
  });
});
