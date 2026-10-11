import type { RunResult, SDKMessage } from "@cursor/sdk";
import { describe, expect, it } from "vitest";
import { toRunResult, toStepEvents } from "../../src/infrastructure/cursorMessages";

const ids = { agent_id: "agent-1", run_id: "run-1" };

describe("toStepEvents", () => {
  it("turns assistant text blocks into text events and drops tool-use blocks", () => {
    const message: SDKMessage = {
      type: "assistant",
      ...ids,
      message: { role: "assistant", content: [{ type: "text", text: "Reading the brief" }, { type: "tool_use", id: "t", name: "read", input: {} }, { type: "text", text: "  " }] },
    };
    expect(toStepEvents(message)).toEqual([{ kind: "text", text: "Reading the brief" }]);
  });

  it("keeps a tool call's id, name and status, never its arguments or result", () => {
    const message: SDKMessage = { type: "tool_call", ...ids, call_id: "c1", name: "edit", status: "completed", args: { secret: 1 }, result: "x" };
    expect(toStepEvents(message)).toEqual([{ kind: "tool", callId: "c1", name: "edit", status: "completed" }]);
  });

  it("maps thinking and status", () => {
    expect(toStepEvents({ type: "thinking", ...ids, text: "hm" })).toEqual([{ kind: "thinking", text: "hm" }]);
    expect(toStepEvents({ type: "status", ...ids, status: "RUNNING" })).toEqual([{ kind: "status", status: "RUNNING" }]);
  });

  it("ignores the other message types", () => {
    expect(toStepEvents({ type: "system", ...ids })).toEqual([]);
    expect(toStepEvents({ type: "request", ...ids, request_id: "r" })).toEqual([]);
    expect(toStepEvents({ type: "task", ...ids, text: "t" })).toEqual([]);
  });
});

describe("toRunResult", () => {
  it("uses the result text and the token counts", () => {
    const result: RunResult = {
      id: "run-1",
      status: "finished",
      result: "Wrote requirements.md",
      durationMs: 4200,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 15 },
    };
    expect(toRunResult(result)).toEqual({
      status: "finished",
      summary: "Wrote requirements.md",
      durationMs: 4200,
      usage: { inputTokens: 10, outputTokens: 5 },
    });
  });

  it("falls back to the error message, and to zero duration", () => {
    expect(toRunResult({ id: "r", status: "error", error: { message: "rate limited" } })).toEqual({
      status: "error",
      summary: "rate limited",
      durationMs: 0,
    });
  });
});
