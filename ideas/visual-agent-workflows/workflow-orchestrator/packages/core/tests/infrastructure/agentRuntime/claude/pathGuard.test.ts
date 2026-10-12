import type { HookInput } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import { pathGuard, refusalFor } from "../../../../src/infrastructure/agentRuntime/claude/pathGuard";

const cwd = "/host";
const doNotTouch = ["workflow-orchestrator/"];

describe("refusalFor", () => {
  it.each([
    ["src/a.ts", null],
    ["/host/discovery/brief.md", null],
    [".claude/skills/x/SKILL.md", null],
    ["../outside.md", "../outside.md is outside the project"],
    ["/etc/passwd", "/etc/passwd is outside the project"],
    ["workflow-orchestrator/.env", "workflow-orchestrator/.env is protected"],
    ["/host/workflow-orchestrator", "workflow-orchestrator is protected"],
    [".claude/settings.json", ".claude/settings.json is protected"],
    ["config/.env", "config/.env may hold credentials"],
  ])("%s → %s", (path, reason) => {
    expect(refusalFor(path, cwd, doNotTouch)).toBe(reason);
  });
});

describe("pathGuard", () => {
  const hook = pathGuard(cwd, doNotTouch);
  const call = async (tool_name: string, tool_input: unknown) =>
    await hook({ hook_event_name: "PreToolUse", tool_name, tool_input, tool_use_id: "t1", session_id: "s", transcript_path: "", cwd } as HookInput, "t1", {
      signal: new AbortController().signal,
    });

  it("denies a write to a protected file, with the reason", async () => {
    expect(await call("Write", { file_path: "/host/.claude/settings.json", content: "{}" })).toEqual({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "Refused: .claude/settings.json is protected." },
    });
  });

  it("denies a search inside the orchestrator folder", async () => {
    expect(await call("Grep", { pattern: "KEY", path: "workflow-orchestrator" })).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } });
  });

  it("lets other files and tools without paths through", async () => {
    expect(await call("Edit", { file_path: "/host/src/a.ts", old_string: "a", new_string: "b" })).toEqual({});
    expect(await call("Grep", { pattern: "x" })).toEqual({});
  });
});
