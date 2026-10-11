import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import {
  continueRun,
  MissingCredentialsError,
  NotFoundError,
  resumeRun,
  runAgentStep,
  runOutcome,
  scanProject,
  startRun,
  type AgentRuntime,
  type GateDecision,
  type RunEvent,
} from "@orch/core";
import {
  CursorAgentRuntime,
  FakeAgentRuntime,
  FsProjectFiles,
  FsRunFiles,
  FsWorkflowStore,
  LangGraphRunEngine,
  loadConfig,
} from "@orch/core/infrastructure";
import { Hono } from "hono";
import { healthRoutes } from "./routes/healthRoutes";

// The workflow-orchestrator folder (three levels above this file).
export const orchestratorDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

// Builds the HTTP app: creates adapters, hands them to use cases, mounts routes.
export function createApp() {
  return new Hono().route("/api", healthRoutes());
}

// The config and the use cases for one host project. `projectRoot` overrides
// the config file (relative to the orchestrator folder).
export async function createProjectServices(options: { projectRoot?: string } = {}) {
  const config = await loadConfig(orchestratorDir, options);
  const files = new FsProjectFiles(config);
  return { config, scan: async () => await scanProject(files) };
}

// Loads workflow-orchestrator/.env into process.env when the file exists.
function loadEnvFile() {
  try {
    process.loadEnvFile(join(orchestratorDir, ".env"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export type RunServicesOptions = {
  projectRoot?: string;
  dataDir?: string; // tests point this at a temp folder
  fake: boolean; // FakeAgentRuntime instead of Cursor
  onEvent?: (runId: string, event: RunEvent) => void;
};

// Everything needed to run workflows of one host project: adapters, the engine
// on a SQLite checkpointer in <dataDir>, and the run use cases.
export async function createRunServices(options: RunServicesOptions) {
  loadEnvFile();
  const config = await loadConfig(orchestratorDir, {
    ...(options.projectRoot ? { projectRoot: options.projectRoot } : {}),
    ...(options.dataDir ? { dataDir: options.dataDir } : {}),
  });

  const apiKey = process.env.CURSOR_API_KEY;
  if (!options.fake && !apiKey) throw new MissingCredentialsError("CURSOR_API_KEY");
  const runtime: AgentRuntime =
    options.fake || !apiKey ? new FakeAgentRuntime([{ summary: "fake agent: nothing was changed" }]) : new CursorAgentRuntime({ apiKey });

  const projectFiles = new FsProjectFiles(config);
  const registry = await scanProject(projectFiles);
  const store = new FsWorkflowStore(config);
  const runFiles = new FsRunFiles(config.dataDir);
  await mkdir(config.dataDir, { recursive: true });
  const checkpointer = SqliteSaver.fromConnString(join(config.dataDir, "checkpoints.sqlite"));

  const inside = relative(config.projectRoot, orchestratorDir);
  const doNotTouch = inside && !inside.startsWith("..") && !isAbsolute(inside) ? [`${inside}/`] : [];
  const onEvent = options.onEvent ?? (() => {});
  const agentDeps = {
    runtime,
    registry,
    projectFiles,
    runFiles,
    cwd: config.projectRoot,
    artefactGlobs: config.artefactGlobs,
    defaultModel: config.defaultModel,
    doNotTouch,
    onEvent,
  };
  const engine = new LangGraphRunEngine({
    checkpointer,
    agentStep: async (runId, step, state) => await runAgentStep(agentDeps, runId, step, state),
    onEvent,
  });
  const runDeps = { engine, runFiles };

  return {
    config,
    registry,
    start: async (workflowId: string, inputs: Record<string, string>) => {
      const workflow = await store.get(workflowId);
      if (!workflow) throw new NotFoundError(`no workflow "${workflowId}" in ${join(config.projectRoot, config.workflowsDir)}`);
      const newId = () => `run-${randomUUID().slice(0, 8)}`;
      return await startRun({ engine, runFiles, registry, phases: await store.phases(), newId }, workflow, inputs);
    },
    resume: async (runId: string, decision: GateDecision) => await resumeRun(runDeps, runId, decision),
    continue: async (runId: string) => await continueRun(runDeps, runId),
    outcome: async (runId: string) => await runOutcome(runDeps, runId),
  };
}
