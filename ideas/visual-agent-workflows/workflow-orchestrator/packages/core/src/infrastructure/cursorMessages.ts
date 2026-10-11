import type { RunResult, SDKMessage } from "@cursor/sdk";
import type { AgentRunResult } from "../application/AgentRuntime";
import type { StepEvent } from "../domain/runState";

// The StepEvents in one Cursor SDK message. Keeps only fields the SDK calls
// stable: tool arguments and results are dropped.
export function toStepEvents(message: SDKMessage): StepEvent[] {
  switch (message.type) {
    case "assistant":
      return message.message.content.flatMap((block) => (block.type === "text" && block.text.trim() ? [{ kind: "text" as const, text: block.text }] : []));
    case "thinking":
      return message.text.trim() ? [{ kind: "thinking", text: message.text }] : [];
    case "tool_call":
      return [{ kind: "tool", callId: message.call_id, name: message.name, status: message.status }];
    case "status":
      return [{ kind: "status", status: message.status }];
    default:
      return [];
  }
}

// A Cursor RunResult as an AgentRunResult.
export function toRunResult(result: RunResult): AgentRunResult {
  const mapped: AgentRunResult = {
    status: result.status,
    summary: result.result ?? result.error?.message ?? "",
    durationMs: result.durationMs ?? 0,
  };
  if (result.usage) mapped.usage = { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens };
  return mapped;
}
