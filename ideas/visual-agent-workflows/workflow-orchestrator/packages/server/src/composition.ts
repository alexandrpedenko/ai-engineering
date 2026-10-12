import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, constants, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import {
  gateChanges,
  MissingCredentialsError,
  RunCrashedError,
  type RunEvent,
  type RunOutcome,
  runAgentStep,
  runOutcome,
  RunSupervisor,
  scanProject,
  type AgentRuntime,
  type GateDecision,
  type LoggedEvent,
  type ResolvedConfig,
  type RuntimeKind,
} from "@orch/core";
import {
  CREDENTIALS,
  createAgentProvider,
  FakeAgentRuntime,
  FsEventLog,
  FsProjectFiles,
  FsRunFiles,
  FsRunLease,
  FsWorkflowStore,
  isErrno,
  LangGraphRunEngine,
  loadConfig,
  ProviderAgentRuntime,
} from "@orch/core/infrastructure";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createLogger, type Logger } from "./logger";
import { errorResponse } from "./routes/errors";
import { eventRoutes } from "./routes/eventRoutes";
import { healthRoutes } from "./routes/healthRoutes";
import { localOnly } from "./routes/localOnly";
import { phaseRoutes } from "./routes/phaseRoutes";
import { projectRoutes } from "./routes/projectRoutes";
import { runRoutes } from "./routes/runRoutes";
import type { ServerServices } from "./routes/ServerServices";
import { workflowRoutes } from "./routes/workflowRoutes";

const from: Record<string, string> = {
  override: "flag or environment",
  "settings.json": "settings.json",
  "orchestrator.config.json": "orchestrator.config.json",
  default: "default",
};

// The largest request body the server reads (file contents are at most 1 MB).
const MAX_BODY_BYTES = 2 * 1024 * 1024;
// Temporary git index files older than this are left over from a stopped process.
const STALE_TEMP_MS = 60 * 60 * 1000;

// One line naming the project and agent runtime a process uses, and where each
// came from, e.g. "project /code/booking (settings.json) · runtime claude (settings.json)".
export function describeSetup(config: ResolvedConfig, fake: boolean): string {
  const runtime = fake ? "fake agent" : `runtime ${config.runtime} (${from[config.sources?.runtime ?? "default"]})`;
  return `project ${config.projectRoot} (${from[config.sources?.projectRoot ?? "default"]}) · ${runtime}`;
}

// The settings file to read: ORCH_SETTINGS_FILE when set (the test runner
// points it at a file that doesn't exist, so tests never see a developer's
// own settings), else workflow-orchestrator/settings.json.
const settingsOverride = () => (process.env.ORCH_SETTINGS_FILE ? { settingsPath: process.env.ORCH_SETTINGS_FILE } : {});

// The workflow-orchestrator folder (three levels above this file).
export const orchestratorDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

// The orchestrator's version, from its package.json.
export async function orchestratorVersion(): Promise<string> {
  const pkg = JSON.parse(await readFile(join(orchestratorDir, "package.json"), "utf8")) as { version?: unknown };
  return typeof pkg.version === "string" ? pkg.version : "unknown";
}

// The HTTP app over the given services. Only local, JSON requests of at most
// 2 MB get through (localOnly, bodyLimit); every error goes through errorResponse.
export function createApp(services: ServerServices, report: (error: unknown) => void = console.error) {
  return new Hono()
    .use("/api/*", localOnly())
    .use("/api/*", bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ error: "the request body is larger than 2 MB" }, 413) }))
    .route("/api", healthRoutes(services))
    .route("/api", projectRoutes(services))
    .route("/api", phaseRoutes(services))
    .route("/api", workflowRoutes(services))
    .route("/api", runRoutes(services))
    .route("/api", eventRoutes(services))
    .onError((error, c) => errorResponse(error, c, report));
}

// The config and the registry scan for one host project. `projectRoot`
// overrides the config file (relative to the orchestrator folder).
export async function createProjectServices(options: { projectRoot?: string } = {}) {
  const config = await loadConfig(orchestratorDir, { ...options, ...settingsOverride() });
  const files = new FsProjectFiles(config);
  return { config, scan: async () => await scanProject(files) };
}

// Loads the .env file into process.env when it exists: ORCH_ENV_FILE when set
// (the test runner points it at a file that doesn't exist, so tests never see
// a developer's keys), else workflow-orchestrator/.env.
function loadEnvFile() {
  try {
    process.loadEnvFile(process.env.ORCH_ENV_FILE ?? join(orchestratorDir, ".env"));
  } catch (error) {
    if (!isErrno(error, "ENOENT")) throw error;
  }
}

// The orchestrator folder as a project-relative folder ("workflow-orchestrator/")
// when it is inside the project, so agents are told and kept away from it.
export function doNotTouchFor(projectRoot: string, orchestrator: string): string[] {
  const inside = relative(projectRoot, orchestrator);
  return inside && !inside.startsWith("..") && !isAbsolute(inside) ? [`${inside.split(sep).join("/")}/`] : [];
}

// Removes temporary git index files a stopped process left in <dataDir>/tmp.
async function sweepTemp(dataDir: string): Promise<void> {
  const dir = join(dataDir, "tmp");
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    if (isErrno(error, "ENOENT")) return;
    throw error;
  }
  for (const name of names) {
    const path = join(dir, name);
    try {
      if (Date.now() - (await stat(path)).mtimeMs > STALE_TEMP_MS) await rm(path, { force: true });
    } catch (error) {
      if (!isErrno(error, "ENOENT")) throw error;
    }
  }
}

type WiringOptions = {
  projectRoot?: string;
  dataDir?: string; // tests point this at a temp folder
  fake: boolean; // FakeAgentRuntime instead of the configured runtime
  checkpointer?: BaseCheckpointSaver; // default: SQLite in <dataDir>
  logger?: Logger; // default: JSON lines to stderr and <dataDir>/logs/server.log
};

// The adapters, the engine and the run supervisor shared by the CLI and the
// server. The agent runtime is created when a step runs, so the key is read
// then; the registry is scanned again for every step, so edited skills are
// used at once.
async function wire(options: WiringOptions) {
  loadEnvFile();
  const config: ResolvedConfig = await loadConfig(orchestratorDir, {
    ...(options.projectRoot ? { projectRoot: options.projectRoot } : {}),
    ...(options.dataDir ? { dataDir: options.dataDir } : {}),
    ...(process.env.ORCH_RUNTIME ? { runtime: process.env.ORCH_RUNTIME } : {}),
    ...settingsOverride(),
  });
  await mkdir(config.dataDir, { recursive: true });
  await sweepTemp(config.dataDir);
  const logger = options.logger ?? createLogger(config.dataDir);
  const reportError = (error: unknown) => logger.error("background task failed", error);

  // The fake agent reads ORCH_FAKE_DELAY_MS at each step, so a run can be watched.
  const fakeRuntime = new FakeAgentRuntime(() => ({
    summary: "fake agent: wrote placeholder files",
    placeholders: true,
    delayMs: Number(process.env.ORCH_FAKE_DELAY_MS ?? 0),
    events: [
      { kind: "text", text: "Reading the files for this step" },
      { kind: "tool", callId: "fake-edit", name: "edit", status: "running" },
    ],
  }));
  // One runtime per process (it remembers the runs it started), rebuilt only
  // if the key changes. The key is read when a step runs.
  const variable = CREDENTIALS[config.runtime];
  let real: { runtime: ProviderAgentRuntime; apiKey: string } | null = null;
  const runtime = (): AgentRuntime => {
    if (options.fake) return fakeRuntime;
    const apiKey = process.env[variable];
    if (!apiKey) throw new MissingCredentialsError(variable);
    if (real?.apiKey !== apiKey) real = { runtime: new ProviderAgentRuntime(createAgentProvider(config.runtime, apiKey, config.limits), apiKey), apiKey };
    return real.runtime;
  };
  const assertCanRun = () => void runtime();

  const projectFiles = new FsProjectFiles(config);
  const scan = async () => await scanProject(projectFiles);
  const store = new FsWorkflowStore(config);
  const runFiles = new FsRunFiles(config.dataDir, reportError);
  const eventLog = new FsEventLog(config.dataDir);
  const doNotTouch = doNotTouchFor(config.projectRoot, orchestratorDir);

  // The engine and the agent step report to the supervisor, created after them.
  let supervisor: RunSupervisor | undefined;
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
          defaultModel: { id: config.models[config.runtime] },
          doNotTouch,
          stepTimeoutMs: config.limits.stepTimeoutMinutes * 60_000,
          onEvent: (id, event) => supervisor?.onEvent(id, event),
          onHandle: (id, handle) => supervisor?.onHandle(id, handle),
        },
        runId,
        step,
        state,
      ),
    onEvent: (runId, event) => supervisor?.onEvent(runId, event),
  });
  supervisor = new RunSupervisor({
    engine,
    runFiles,
    eventLog,
    store,
    registry: scan,
    newId: () => `run-${randomUUID().slice(0, 8)}`,
    now: () => new Date(),
    assertCanRun,
    lease: new FsRunLease(config.dataDir),
    forgetTrees: async (runId) => await projectFiles.forgetTrees(runId),
    reportError,
  });
  const runtimeName: RuntimeKind | "fake" = options.fake ? "fake" : config.runtime;
  return { config, projectFiles, scan, store, runFiles, eventLog, engine, supervisor, assertCanRun, runtimeName, logger, variable };
}

export type RunServicesOptions = WiringOptions & { onEvent?: (runId: string, event: RunEvent) => void };

const isRunEvent = (event: LoggedEvent["event"]): event is RunEvent => event.type !== "run-settled" && event.type !== "run-crashed";

// The run use cases for the terminal command: each call moves the run through
// the same RunSupervisor as the server (event log, lease, one moving run per
// project) and waits until it stops moving. A run that crashes throws its message.
export async function createRunServices(options: RunServicesOptions) {
  const w = await wire(options);
  w.assertCanRun();
  const onEvent = options.onEvent ?? (() => {});
  const runDeps = { engine: w.engine, runFiles: w.runFiles };

  // Prints the run's events after `after` while it moves, then gives its outcome.
  const follow = async (runId: string, after: number): Promise<RunOutcome> => {
    let crashed: string | null = null;
    const stop = await w.supervisor.watch(runId, after, (logged) => {
      if (logged.event.type === "run-crashed") crashed = logged.event.message;
      else if (logged.event.type === "run-settled") crashed = null;
      if (isRunEvent(logged.event)) onEvent(runId, logged.event);
    });
    try {
      await w.supervisor.settled(runId);
    } finally {
      stop();
    }
    if (crashed !== null) throw new RunCrashedError(runId, crashed);
    return await runOutcome(runDeps, runId);
  };
  const act = async (runId: string, action: () => Promise<void>) => {
    const after = await w.eventLog.lastSeq(runId);
    await action();
    return await follow(runId, after);
  };

  return {
    config: w.config,
    setup: describeSetup(w.config, options.fake),
    start: async (workflowId: string, inputs: Record<string, string>) => {
      const { runId } = await w.supervisor.start(workflowId, inputs);
      return { runId, outcome: await follow(runId, 0) };
    },
    resume: async (runId: string, decision: GateDecision) => await act(runId, async () => await w.supervisor.resume(runId, decision)),
    continue: async (runId: string) => await act(runId, async () => await w.supervisor.continue(runId)),
    retry: async (runId: string) => await act(runId, async () => await w.supervisor.retry(runId)),
    outcome: async (runId: string) => await runOutcome(runDeps, runId),
    gateChanges: async (runId: string, gateId: string) => await gateChanges({ ...runDeps, projectFiles: w.projectFiles }, runId, gateId),
    delete: async (runId: string) => await w.supervisor.delete(runId),
  };
}

const run = promisify(execFile);

// Whether git can be run here.
async function hasGit(): Promise<boolean> {
  try {
    await run("git", ["--version"]);
    return true;
  } catch {
    return false; // not installed, or not on PATH
  }
}

// Whether this process can write in `dir`.
async function canWrite(dir: string): Promise<boolean> {
  try {
    await access(dir, constants.W_OK);
    return true;
  } catch {
    return false; // missing or read-only
  }
}

// The services behind the HTTP app: runs go on in the background under the
// RunSupervisor. The server starts without an API key; starting a run then
// answers 503.
export async function createServerServices(options: WiringOptions): Promise<ServerServices & { config: ResolvedConfig; logger: Logger }> {
  const w = await wire(options);
  const version = await orchestratorVersion();
  return {
    config: w.config,
    logger: w.logger,
    runtimeName: w.runtimeName,
    scan: w.scan,
    projectFiles: w.projectFiles,
    store: w.store,
    runFiles: w.runFiles,
    engine: w.engine,
    supervisor: w.supervisor,
    health: async () => ({
      version,
      git: await hasGit(),
      dataDirWritable: await canWrite(w.config.dataDir),
      credentials: options.fake || Boolean(process.env[w.variable]),
    }),
  };
}
