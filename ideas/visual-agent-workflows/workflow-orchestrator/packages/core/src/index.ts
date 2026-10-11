// Public surface of @orch/core: domain and application. Adapters are in
// "@orch/core/infrastructure".
export { toAgentDef } from "./domain/agentDef";
export { OrchestratorConfig, type ResolvedConfig } from "./domain/config";
export type { AgentDef, Artefact, MarkdownDoc, Registry, RegistryWarning, Skill, UnreadableDoc } from "./domain/registry";
export { toSkill } from "./domain/skill";
export { InvalidConfigError } from "./application/errors";
export type { ProjectFiles } from "./application/ProjectFiles";
export { scanProject } from "./application/scanProject";
