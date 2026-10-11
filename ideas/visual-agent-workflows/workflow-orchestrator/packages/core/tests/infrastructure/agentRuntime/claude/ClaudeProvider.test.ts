import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import type { StepEvent } from "../../../../src/domain/runState";
import { type ClaudeQuery, ClaudeProvider } from "../../../../src/infrastructure/agentRuntime/claude/ClaudeProvider";
import { assistant, failure, init, success } from "./messages";

const KEY = "sk-ant-secret";
const request = {
  cwd: "/host",
  model: { id: "claude-opus-5-5" },
  message: "Do it",
  key: "run-1:elicit:1",
  subagents: [{ name: "business-analyst", description: "Analyst.", prompt: "You are a BA." }],
};

// A query that records its options and replays `messages`; `holdAfter` makes
// it wait (until aborted) after that many messages; `throwAt` throws there.
function fakeQuery(messages: SDKMessage[], options: { holdAfter?: number; throwAt?: number } = {}) {
  const calls: { prompt: string; options: Options }[] = [];
  const query: ClaudeQuery = (params) => {
    calls.push(params);
    return (async function* () {
      for (const [i, message] of messages.entries()) {
        if (i === options.throwAt) throw new Error("Invalid API key");
        if (i === options.holdAfter) {
          await new Promise<void>((_, reject) =>
            params.options.abortController?.signal.addEventListener("abort", () => reject(new Error("aborted"))),
          );
        }
        yield message;
      }
    })();
  };
  return { query, calls };
}

async function collect(events: AsyncIterable<StepEvent>) {
  const all: StepEvent[] = [];
  for await (const event of events) all.push(event);
  return all;
}

describe("ClaudeProvider.open", () => {
  it("runs Claude Code in the project with its own prompt, project settings, subagents and no shell", async () => {
    const { query, calls } = fakeQuery([init, success()]);

    const run = await new ClaudeProvider({ apiKey: KEY, query }).open(request);
    await run.result();

    const { prompt, options } = calls[0] ?? { prompt: "", options: {} };
    expect(prompt).toBe("Do it");
    expect(options).toMatchObject({
      cwd: "/host",
      model: "claude-opus-5-5",
      systemPrompt: { type: "preset", preset: "claude_code" },
      settingSources: ["project"],
      permissionMode: "acceptEdits",
      disallowedTools: ["Bash"],
      agents: { "business-analyst": { description: "Analyst.", prompt: "You are a BA." } },
      sessionId: run.id,
    });
    expect(options.allowedTools).toContain("Edit");
    expect(options.env?.ANTHROPIC_API_KEY).toBe(KEY);
  });

  it("streams events and ends with the result", async () => {
    const { query } = fakeQuery([init, assistant([{ type: "text", text: "Reading the brief" }]), success()]);

    const run = await new ClaudeProvider({ apiKey: KEY, query }).open(request);

    expect(await collect(run.events())).toEqual([{ kind: "text", text: "Reading the brief" }]);
    expect(await run.result()).toMatchObject({ status: "finished", summary: "Wrote discovery/requirements.md" });
  });

  it("fails to open when Claude errors before starting, so the step can fail cleanly", async () => {
    await expect(new ClaudeProvider({ apiKey: KEY, query: fakeQuery([init], { throwAt: 0 }).query }).open(request)).rejects.toThrow("Invalid API key");
    await expect(new ClaudeProvider({ apiKey: KEY, query: fakeQuery([failure(["Credit balance is too low"])]).query }).open(request)).rejects.toThrow(
      "Credit balance is too low",
    );
  });

  it("reports an error after starting as an error result", async () => {
    const { query } = fakeQuery([init, assistant([{ type: "text", text: "x" }]), success()], { throwAt: 2 });
    const run = await new ClaudeProvider({ apiKey: KEY, query }).open(request);
    expect(await run.result()).toMatchObject({ status: "error", summary: "Invalid API key" });
  });

  it("cancels by aborting the query", async () => {
    const { query } = fakeQuery([init, success()], { holdAfter: 1 });
    const run = await new ClaudeProvider({ apiKey: KEY, query }).open(request);

    const waiting = run.result();
    await run.cancel();

    expect(await waiting).toMatchObject({ status: "cancelled", summary: "cancelled" });
  });

  it("gives each run its own session id", async () => {
    const provider = new ClaudeProvider({ apiKey: KEY, query: fakeQuery([init, success()]).query });
    const a = await provider.open(request);
    const b = await provider.open(request);
    expect(a.id).not.toBe(b.id);
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("ClaudeProvider.find", () => {
  it("always says a run from another process was cut off", async () => {
    expect(await new ClaudeProvider({ apiKey: KEY }).find()).toBe("cut-off");
  });
});
