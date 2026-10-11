import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// Claude Agent SDK messages with only the fields the orchestrator reads.
export const init = { type: "system", subtype: "init", session_id: "s1" } as unknown as SDKMessage;
export const assistant = (content: object[]) => ({ type: "assistant", message: { content }, session_id: "s1" }) as unknown as SDKMessage;
export const toolResults = (content: object[]) => ({ type: "user", message: { role: "user", content }, session_id: "s1" }) as unknown as SDKMessage;
export const usage = { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 };
export const success = (result = "Wrote discovery/requirements.md") =>
  ({ type: "result", subtype: "success", result, duration_ms: 4200, usage, errors: [] }) as unknown as SDKMessage;
export const failure = (errors: string[]) =>
  ({ type: "result", subtype: "error_during_execution", duration_ms: 300, usage, errors }) as unknown as SDKMessage;
