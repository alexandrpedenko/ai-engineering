import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it, vi } from "vitest";
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
      disallowedTools: ["Bash", "WebFetch", "WebSearch"],
      agents: { "business-analyst": { description: "Analyst.", prompt: "You are a BA." } },
      sessionId: run.id,
    });
    expect(options.allowedTools).toContain("Edit");
    expect(options.env?.ANTHROPIC_API_KEY).toBe(KEY);
    expect(options.hooks?.PreToolUse?.[0]?.hooks).toHaveLength(1);
  });

  it("passes only an allow-listed environment, never other providers' keys", async () => {
    vi.stubEnv("CURSOR_API_KEY", "crsr_other");
    vi.stubEnv("LC_ALL", "en_US.UTF-8");
    const { query, calls } = fakeQuery([init, success()]);

    await (await new ClaudeProvider({ apiKey: KEY, query }).open(request)).result();

    const env = calls[0]?.options.env ?? {};
    expect(env.CURSOR_API_KEY).toBeUndefined();
    expect(env.LC_ALL).toBe("en_US.UTF-8");
    expect(env.PATH).toBe(process.env.PATH);
    vi.unstubAllEnvs();
  });

  it("passes the turn and budget limits", async () => {
    const { query, calls } = fakeQuery([init, success()]);

    await (await new ClaudeProvider({ apiKey: KEY, query, limits: { maxTurns: 30, maxBudgetUsd: 1.5 } }).open(request)).result();

    expect(calls[0]?.options).toMatchObject({ maxTurns: 30, maxBudgetUsd: 1.5 });
  });

  it("refuses file tools on the orchestrator folder it is told not to touch", async () => {
    const { query, calls } = fakeQuery([init, success()]);
    await (await new ClaudeProvider({ apiKey: KEY, query }).open({ ...request, doNotTouch: ["workflow-orchestrator/"] })).result();

    const hook = calls[0]?.options.hooks?.PreToolUse?.[0]?.hooks[0];
    const input = { hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "/host/workflow-orchestrator/.env" }, tool_use_id: "t", session_id: "s", transcript_path: "", cwd: "/host" };
    expect(await hook?.(input as never, "t", { signal: new AbortController().signal })).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
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
