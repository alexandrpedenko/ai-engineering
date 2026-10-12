import { describe, expect, it } from "vitest";
import { OrchestratorConfig } from "../../src/domain/config";

describe("OrchestratorConfig", () => {
  it("fills every default from an empty object", () => {
    expect(OrchestratorConfig.parse({})).toEqual({
      projectRoot: "..",
      workflowsDir: ".cursor/workflows",
      skillDirs: [".cursor/skills", ".agents/skills"],
      agentDirs: [".cursor/agents"],
      runtime: "cursor",
      models: { cursor: "composer-2.5", claude: "claude-opus-5-5" },
      dataDir: ".data",
      limits: { stepTimeoutMinutes: 60, maxTurns: 200 },
    });
  });

  it("reads step limits and refuses a bad one", () => {
    expect(OrchestratorConfig.parse({ limits: { stepTimeoutMinutes: 5, maxBudgetUsd: 2 } }).limits).toEqual({ stepTimeoutMinutes: 5, maxTurns: 200, maxBudgetUsd: 2 });
    expect(OrchestratorConfig.safeParse({ limits: { stepTimeoutMinutes: 0 } }).success).toBe(false);
    expect(OrchestratorConfig.safeParse({ limits: { timeout: 5 } }).success).toBe(false);
  });

  it("reads the runtime and per-runtime models", () => {
    const config = OrchestratorConfig.parse({ runtime: "claude", models: { claude: "claude-sonnet-5-5" } });
    expect(config.runtime).toBe("claude");
    expect(config.models).toEqual({ cursor: "composer-2.5", claude: "claude-sonnet-5-5" });
  });

  it("reads an old defaultModel as the Cursor model", () => {
    const config = OrchestratorConfig.parse({ defaultModel: { id: "composer-2" } });
    expect(config.models.cursor).toBe("composer-2");
    expect(config).not.toHaveProperty("defaultModel");
  });

  it("rejects an unknown runtime", () => {
    expect(OrchestratorConfig.safeParse({ runtime: "gemini" }).success).toBe(false);
  });

  it("rejects an unknown key", () => {
    const result = OrchestratorConfig.safeParse({ skilDirs: ["x"] });
    expect(result.success).toBe(false);
  });

  it("rejects a wrong type", () => {
    const result = OrchestratorConfig.safeParse({ skillDirs: ".cursor/skills" });
    expect(result.success).toBe(false);
  });
});
