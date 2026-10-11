import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import { ClaudeEventMapper } from "../../../../src/infrastructure/agentRuntime/claude/ClaudeEventMapper";
import { assistant, failure, init, success, toolResults } from "./messages";

describe("ClaudeEventMapper.map", () => {
  it("turns assistant text, thinking and tool calls into events, dropping tool inputs", () => {
    const events = new ClaudeEventMapper().map(
      assistant([
        { type: "thinking", thinking: "Plan the sections" },
        { type: "text", text: "Reading the brief" },
        { type: "tool_use", id: "t1", name: "Write", input: { file_path: "/secret" } },
        { type: "text", text: "  " },
      ]),
    );
    expect(events).toEqual([
      { kind: "thinking", text: "Plan the sections" },
      { kind: "text", text: "Reading the brief" },
      { kind: "tool", callId: "t1", name: "Write", status: "running" },
    ]);
  });

  it("reports a tool result as that tool completing or failing", () => {
    const mapper = new ClaudeEventMapper();
    mapper.map(assistant([{ type: "tool_use", id: "t1", name: "Edit", input: {} }]));

    expect(mapper.map(toolResults([{ type: "tool_result", tool_use_id: "t1", content: "ok" }]))).toEqual([
      { kind: "tool", callId: "t1", name: "Edit", status: "completed" },
    ]);
    expect(mapper.map(toolResults([{ type: "tool_result", tool_use_id: "t9", is_error: true, content: "no" }]))).toEqual([
      { kind: "tool", callId: "t9", name: "tool", status: "error" },
    ]);
  });

  it("ignores other messages", () => {
    expect(new ClaudeEventMapper().map(init)).toEqual([]);
  });
});

describe("ClaudeEventMapper.toRunResult", () => {
  it("maps success with tokens (cache reads count as input)", () => {
    expect(ClaudeEventMapper.toRunResult(success() as SDKResultMessage)).toEqual({
      status: "finished",
      summary: "Wrote discovery/requirements.md",
      durationMs: 4200,
      usage: { inputTokens: 1000, outputTokens: 40 },
    });
  });

  it("maps an error result to its joined errors", () => {
    expect(ClaudeEventMapper.toRunResult(failure(["rate limited", "retry later"]) as SDKResultMessage)).toMatchObject({
      status: "error",
      summary: "rate limited; retry later",
    });
  });
});
