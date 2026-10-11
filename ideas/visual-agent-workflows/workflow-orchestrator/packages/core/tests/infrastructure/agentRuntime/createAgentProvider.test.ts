import { describe, expect, it } from "vitest";
import { ClaudeProvider } from "../../../src/infrastructure/agentRuntime/claude/ClaudeProvider";
import { CREDENTIALS, createAgentProvider } from "../../../src/infrastructure/agentRuntime/createAgentProvider";
import { CursorProvider } from "../../../src/infrastructure/agentRuntime/cursor/CursorProvider";

describe("createAgentProvider", () => {
  it("builds the provider for each runtime", () => {
    expect(createAgentProvider("cursor", "k")).toBeInstanceOf(CursorProvider);
    expect(createAgentProvider("claude", "k")).toBeInstanceOf(ClaudeProvider);
  });

  it("names each runtime's key variable", () => {
    expect(CREDENTIALS).toEqual({ cursor: "CURSOR_API_KEY", claude: "ANTHROPIC_API_KEY" });
  });
});
