import { z } from "zod";

// orchestrator.config.json. Every key is optional; unknown keys are errors so a
// typo is not silently ignored.
export const OrchestratorConfig = z.strictObject({
  projectRoot: z.string().default(".."),
  workflowsDir: z.string().default(".cursor/workflows"),
  skillDirs: z.array(z.string()).default([".cursor/skills", ".agents/skills"]),
  agentDirs: z.array(z.string()).default([".cursor/agents"]),
  artefactGlobs: z.array(z.string()).default(["discovery/**", "wiki/**", "delivery/**", "docs/**"]),
  defaultModel: z.object({ id: z.string() }).default({ id: "composer-2.5" }),
  dataDir: z.string().default(".data"),
});

export type OrchestratorConfig = z.infer<typeof OrchestratorConfig>;

// The config with its folders made absolute. `workflowsDir`, `skillDirs`,
// `agentDirs` and `artefactGlobs` stay relative to `projectRoot`.
export type ResolvedConfig = Omit<OrchestratorConfig, "projectRoot" | "dataDir"> & {
  orchestratorDir: string;
  projectRoot: string;
  dataDir: string;
};
