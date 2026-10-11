// Public surface of @orch/core: domain and application. Adapters are in
// "@orch/core/infrastructure".
export { toAgentDef } from "./domain/agentDef";
export { buildPrompt, resolveModel, type PromptInput } from "./domain/buildPrompt";
export { OrchestratorConfig, type ResolvedConfig } from "./domain/config";
export { DEFAULT_PHASES, Phase, PhasesFile } from "./domain/phase";
export type { AgentDef, Artefact, MarkdownDoc, Registry, RegistryWarning, Skill, UnreadableDoc } from "./domain/registry";
export { diffSnapshots, type FileChange, type Snapshot } from "./domain/outputs";
export { GateDecision, type RunEvent, type RunState, type StepEvent, type StepRecord, type Usage } from "./domain/runState";
export { toSkill } from "./domain/skill";
export { fillTemplate, templateRefs } from "./domain/template";
export { hasErrors, validate, type Problem, type ValidationContext } from "./domain/validate";
export { AgentStep, Edge, GateStep, Step, Workflow, WorkflowInput } from "./domain/workflow";
export type { AgentRunRequest, AgentRunResult, AgentRuntime, RunHandle } from "./application/AgentRuntime";
export { ConflictError, InvalidConfigError, InvalidInputError, MissingCredentialsError, NotFoundError } from "./application/errors";
export { continueRun } from "./application/continueRun";
export { loadRunWorkflow } from "./application/loadRunWorkflow";
export type { ProjectFiles } from "./application/ProjectFiles";
export type { RunFiles, RunRef } from "./application/RunFiles";
export { runOutcome } from "./application/runOutcome";
export type { WorkflowStore } from "./application/WorkflowStore";
export type { RunEngine, RunOutcome } from "./application/RunEngine";
export { runAgentStep, type AgentStepDeps } from "./application/runAgentStep";
export { resumeRun } from "./application/resumeRun";
export { scanProject } from "./application/scanProject";
export { startRun, type StartRunDeps } from "./application/startRun";
