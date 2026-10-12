import { describe, expect, it } from "vitest";
import { isProtected, protectedWrites } from "../../src/domain/protectedPaths";

describe("isProtected", () => {
  it.each([
    ["workflow-orchestrator/packages/server/src/main.ts", true],
    [".claude/settings.json", true],
    [".claude/hooks/pre.sh", true],
    [".cursor/mcp.json", true],
    [".mcp.json", true],
    [".git/config", true],
    [".claude/skills/x/SKILL.md", false],
    [".cursor/agents/developer.md", false],
    ["src/workflow-orchestrator.ts", false],
    ["discovery/requirements.md", false],
  ])("%s → %s", (path, expected) => {
    expect(isProtected(path, ["workflow-orchestrator/"])).toBe(expected);
  });
});

describe("protectedWrites", () => {
  it("lists the changed files that are protected", () => {
    const writes = [
      { path: "src/a.ts", change: "modified" as const },
      { path: ".claude/settings.json", change: "created" as const },
      { path: "workflow-orchestrator/.env", change: "deleted" as const },
    ];
    expect(protectedWrites(writes, ["workflow-orchestrator/"])).toEqual([".claude/settings.json", "workflow-orchestrator/.env"]);
  });
});
