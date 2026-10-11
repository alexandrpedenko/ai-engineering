import type { SDKMessage, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentRunResult } from "../../../application/AgentRuntime";
import type { StepEvent } from "../../../domain/runState";

// Turns Claude Agent SDK messages into StepEvents for one run. Remembers each
// tool call's name, so the later tool result can be reported as that tool
// finishing. Tool inputs and outputs are never passed on.
export class ClaudeEventMapper {
  private readonly toolNames = new Map<string, string>();

  map(message: SDKMessage): StepEvent[] {
    if (message.type === "assistant") {
      const events: StepEvent[] = [];
      for (const block of message.message.content) {
        if (block.type === "text" && block.text.trim()) events.push({ kind: "text", text: block.text });
        else if (block.type === "thinking" && block.thinking.trim()) events.push({ kind: "thinking", text: block.thinking });
        else if (block.type === "tool_use") {
          this.toolNames.set(block.id, block.name);
          events.push({ kind: "tool", callId: block.id, name: block.name, status: "running" });
        }
      }
      return events;
    }
    if (message.type === "user" && Array.isArray(message.message.content)) {
      return message.message.content.flatMap((block): StepEvent[] =>
        block.type === "tool_result"
          ? [
              {
                kind: "tool",
                callId: block.tool_use_id,
                name: this.toolNames.get(block.tool_use_id) ?? "tool",
                status: block.is_error ? "error" : "completed",
              },
            ]
          : [],
      );
    }
    return [];
  }

  // A run's `result` message as an AgentRunResult. Input tokens include tokens
  // read from and written to the prompt cache.
  static toRunResult(message: SDKResultMessage): AgentRunResult {
    const usage = message.usage;
    const result: AgentRunResult =
      message.subtype === "success"
        ? { status: "finished", summary: message.result, durationMs: message.duration_ms }
        : { status: "error", summary: message.errors.join("; ") || message.subtype, durationMs: message.duration_ms };
    result.usage = {
      inputTokens: usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
      outputTokens: usage.output_tokens,
    };
    return result;
  }
}
