import type { Limits, RuntimeKind } from "../../domain/config";
import type { AgentProvider } from "./AgentProvider";
import { ClaudeProvider } from "./claude/ClaudeProvider";
import { CursorProvider } from "./cursor/CursorProvider";

// The environment variable holding each provider's API key.
export const CREDENTIALS: Record<RuntimeKind, string> = {
  cursor: "CURSOR_API_KEY",
  claude: "ANTHROPIC_API_KEY",
};

// The provider for a runtime kind, using the given API key and step limits.
export function createAgentProvider(kind: RuntimeKind, apiKey: string, limits?: Limits): AgentProvider {
  switch (kind) {
    case "cursor":
      return new CursorProvider({ apiKey });
    case "claude":
      return new ClaudeProvider({ apiKey, ...(limits ? { limits: { maxTurns: limits.maxTurns, ...(limits.maxBudgetUsd ? { maxBudgetUsd: limits.maxBudgetUsd } : {}) } } : {}) });
  }
}
