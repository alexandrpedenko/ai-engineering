import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import {
  continueRun,
  MissingCredentialsError,
  NotFoundError,
  type RunEvent,
  resumeRun,
  type RunHandle,
  runAgentStep,
  runOutcome,
  RunSupervisor,
  scanProject,
  startRun,
  type AgentRuntime,
  type GateDecision,
  type ResolvedConfig,
} from "@orch/core";
import {
  CursorAgentRuntime,
  FakeAgentRuntime,
  FsEventLog,
  FsProjectFiles,
  FsRunFiles,
  FsWorkflowStore,
  LangGraphRunEngine,
  loadConfig,
} from "@orch/core/infrastructure";
import { Hono } from "hono";
import { errorResponse } from "./routes/errors";
import { eventRoutes } from "./routes/eventRoutes";
import { healthRoutes } from "./routes/healthRoutes";
import { phaseRoutes } from "./routes/phaseRoutes";
import { projectRoutes } from "./routes/projectRoutes";
import { runRoutes } from "./routes/runRoutes";
import type { ServerServices } from "./routes/ServerServices";
import { workflowRoutes } from "./routes/workflowRoutes";

// The workflow-orchestrator folder (three levels above this file).
export const orchestratorDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

// The HTTP app over the given services. Every error goes through errorResponse.
export function createApp(services: ServerServices) {
  return new Hono()
    .route("/api", healthRoutes())
    .route("/api", projectRoutes(services))
    .route("/api", phaseRoutes(services))
    .route("/api", workflowRoutes(services))
    .route("/api", runRoutes(services))
    .route("/api", eventRoutes(services))
    .onError((error, c) => errorResponse(error, c));
}

// The config and the registry scan for one host project. `projectRoot`
// overrides the config file (relative to the orchestrator folder).
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

type WiringOptions = {
  projectRoot?: string;
  dataDir?: string; // tests point this at a temp folder
  fake: boolean; // FakeAgentRuntime instead of Cursor
  checkpointer?: BaseCheckpointSaver; // default: SQLite in <dataDir>
};

type Callbacks = {
  onEvent: (runId: string, event: RunEvent) => void;
  onHandle?: (runId: string, handle: RunHandle | null) => void;
};

// The adapters and the engine shared by the CLI and the server. The agent
// runtime is created when a step runs, so the key is read then; the registry
// is scanned again for every step, so edited skills are used at once.
async function wire(options: WiringOptions, callbacks: Callbacks) {
  loadEnvFile();
  const config: ResolvedConfig = await loadConfig(orchestratorDir, {
    ...(options.projectRoot ? { projectRoot: options.projectRoot } : {}),
    ...(options.dataDir ? { dataDir: options.dataDir } : {}),
  });
  await mkdir(config.dataDir, { recursive: true });

  const fakeRuntime = new FakeAgentRuntime([{ summary: "fake agent: wrote placeholder files", placeholders: true }]);
  const runtime = (): AgentRuntime => {
    if (options.fake) return fakeRuntime;
    const apiKey = process.env.CURSOR_API_KEY;
    if (!apiKey) throw new MissingCredentialsError("CURSOR_API_KEY");
    return new CursorAgentRuntime({ apiKey });
  };
  const assertCanRun = () => void runtime();

  const projectFiles = new FsProjectFiles(config);
  const scan = async () => await scanProject(projectFiles);
  const store = new FsWorkflowStore(config);
  const runFiles = new FsRunFiles(config.dataDir);
  const inside = relative(config.projectRoot, orchestratorDir);
  const doNotTouch = inside && !inside.startsWith("..") && !isAbsolute(inside) ? [`${inside}/`] : [];

  const engine = new LangGraphRunEngine({
    checkpointer: options.checkpointer ?? SqliteSaver.fromConnString(join(config.dataDir, "checkpoints.sqlite")),
    agentStep: async (runId, step, state) =>
      await runAgentStep(
        {
          runtime: runtime(),
          registry: await scan(),
          projectFiles,
          runFiles,
          cwd: config.projectRoot,
          artefactGlobs: config.artefactGlobs,
          defaultModel: config.defaultModel,
          doNotTouch,
          onEvent: callbacks.onEvent,
          ...(callbacks.onHandle ? { onHandle: callbacks.onHandle } : {}),
        },
        runId,
        step,
        state,
      ),
    onEvent: callbacks.onEvent,
  });
  return { config, projectFiles, scan, store, runFiles, engine, assertCanRun };
}

const newRunId = () => `run-${randomUUID().slice(0, 8)}`;

export type RunServicesOptions = WiringOptions & { onEvent?: (runId: string, event: RunEvent) => void };

// The run use cases for the terminal command: each call runs until the run
// stops moving.
export async function createRunServices(options: RunServicesOptions) {
  const w = await wire(options, { onEvent: options.onEvent ?? (() => {}) });
  w.assertCanRun();
  const runDeps = { engine: w.engine, runFiles: w.runFiles };
  return {
    config: w.config,
    start: async (workflowId: string, inputs: Record<string, string>) => {
      const workflow = await w.store.get(workflowId);
      if (!workflow) throw new NotFoundError(`no workflow "${workflowId}" in ${join(w.config.projectRoot, w.config.workflowsDir)}`);
      const deps = { engine: w.engine, runFiles: w.runFiles, registry: await w.scan(), phases: await w.store.phases(), newId: newRunId, now: () => new Date() };
      return await startRun(deps, workflow, inputs);
    },
    resume: async (runId: string, decision: GateDecision) => await resumeRun(runDeps, runId, decision),
    continue: async (runId: string) => await continueRun(runDeps, runId),
    outcome: async (runId: string) => await runOutcome(runDeps, runId),
  };
}

// The services behind the HTTP app: runs go on in the background under a
// RunSupervisor. The server starts without an API key; starting a run then
// answers 503.
export async function createServerServices(options: WiringOptions): Promise<ServerServices & { config: ResolvedConfig }> {
  let supervisor: RunSupervisor | undefined;
  const w = await wire(options, {
    onEvent: (runId, event) => supervisor?.onEvent(runId, event),
    onHandle: (runId, handle) => supervisor?.onHandle(runId, handle),
  });
  supervisor = new RunSupervisor({
    engine: w.engine,
    runFiles: w.runFiles,
    eventLog: new FsEventLog(w.config.dataDir),
    store: w.store,
    registry: w.scan,
    newId: newRunId,
    now: () => new Date(),
    assertCanRun: w.assertCanRun,
    reportError: (error) => console.error("event log write failed:", error),
  });
  return { config: w.config, scan: w.scan, projectFiles: w.projectFiles, store: w.store, runFiles: w.runFiles, engine: w.engine, supervisor };
}
