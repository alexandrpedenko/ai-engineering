import { z } from "zod";

// Which agent runs the steps: Cursor's or Claude's (ADR-0013).
export const RuntimeKind = z.enum(["cursor", "claude"]);
export type RuntimeKind = z.infer<typeof RuntimeKind>;

const DEFAULT_MODELS = { cursor: "composer-2.5", claude: "claude-opus-5-5" };

// orchestrator.config.json. Every key is optional; unknown keys are errors so a
// typo is not silently ignored. `defaultModel` is how the Cursor model was set
// before per-runtime `models`; old files that still have it keep working.
export const OrchestratorConfig = z
  .strictObject({
    projectRoot: z.string().default(".."),
    workflowsDir: z.string().default(".cursor/workflows"),
    skillDirs: z.array(z.string()).default([".cursor/skills", ".agents/skills"]),
    agentDirs: z.array(z.string()).default([".cursor/agents"]),
    artefactGlobs: z.array(z.string()).optional(), // unset: every markdown or text file is an artefact
    runtime: RuntimeKind.default("cursor"),
    models: z
      .strictObject({ cursor: z.string().default(DEFAULT_MODELS.cursor), claude: z.string().default(DEFAULT_MODELS.claude) })
      .default(DEFAULT_MODELS),
    defaultModel: z.object({ id: z.string() }).optional(),
    dataDir: z.string().default(".data"),
  })
  .transform(({ defaultModel, ...config }) =>
    defaultModel ? { ...config, models: { ...config.models, cursor: defaultModel.id } } : config,
  );

export type OrchestratorConfig = z.output<typeof OrchestratorConfig>;

// The config with its folders made absolute. `workflowsDir`, `skillDirs`,
// `agentDirs` and `artefactGlobs` stay relative to `projectRoot`.
export type ResolvedConfig = Omit<OrchestratorConfig, "projectRoot" | "dataDir"> & {
  orchestratorDir: string;
  projectRoot: string;
  dataDir: string;
  // Where projectRoot and runtime came from (set by loadConfig).
  sources?: {
    projectRoot: "override" | "settings.json" | "orchestrator.config.json" | "default";
    runtime: "override" | "settings.json" | "orchestrator.config.json" | "default";
  };
};
