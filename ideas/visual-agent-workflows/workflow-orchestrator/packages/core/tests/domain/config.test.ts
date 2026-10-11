import { describe, expect, it } from "vitest";
import { OrchestratorConfig } from "../../src/domain/config";

describe("OrchestratorConfig", () => {
  it("fills every default from an empty object", () => {
    expect(OrchestratorConfig.parse({})).toEqual({
      projectRoot: "..",
      workflowsDir: ".cursor/workflows",
      skillDirs: [".cursor/skills", ".agents/skills"],
      agentDirs: [".cursor/agents"],
      artefactGlobs: ["discovery/**", "wiki/**", "delivery/**", "docs/**"],
      runtime: "cursor",
      models: { cursor: "composer-2.5", claude: "claude-opus-5-5" },
      dataDir: ".data",
    });
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
