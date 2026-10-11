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
      defaultModel: { id: "composer-2.5" },
      dataDir: ".data",
    });
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
