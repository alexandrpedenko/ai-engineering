---
title: Composition, config and data on disk
area: composition
summary: Where adapters are created and wired into use cases, which environment variables matter, and every file the orchestrator reads or writes.
code:
  - packages/server/src/composition.ts
  - packages/server/src/main.ts
  - packages/core/src/index.ts
  - packages/core/src/infrastructure/index.ts
  - orchestrator.config.json
  - settings.example.json
  - scripts/**
  - packages/server/src/logger.ts
depends_on: [project-registry, workflows, engine, agent-steps, runs-and-events]
used_by: [http-api, cli]
adrs: [1, 4, 8, 10, 13]
specs: [3-cursor-runtime, 4-server, 5.6-claude-runtime, 5.7-local-settings, 5.8-artefacts-anywhere]
updated: 2026-10-12
---

# Composition, config and data on disk

**What it answers:** what is real and what is fake in a given process, and
where does everything live?

## Wiring (`server/src/composition.ts`)

The only place that creates adapters (ADR-0010). One private `wire()` builds
what the CLI and the server share:

- config (`loadConfig`, after loading the `.env` file `ORCH_ENV_FILE` names,
  else `workflow-orchestrator/.env`, if present); `<dataDir>/tmp` is swept of
  index files older than an hour
- a logger (`logger.ts`): JSON lines to standard error and
  `<dataDir>/logs/server.log`; background failures go there
- `FsProjectFiles`, a `scan()` of the registry, `FsWorkflowStore`,
  `FsRunFiles` (reporting unreadable runs), `FsEventLog`
- the agent runtime, chosen **when a step runs**: `FakeAgentRuntime` with
  placeholder writes, two sample events and `ORCH_FAKE_DELAY_MS` (read at each
  step) when `fake`; else a `ProviderAgentRuntime` over the configured
  provider (`createAgentProvider(config.runtime, key, config.limits)`), with the key from
  `CREDENTIALS[runtime]` (missing → `MissingCredentialsError` naming that
  variable). One instance per process, so it can reattach to runs it started;
  rebuilt only if the key changes. The step's default model is
  `config.models[config.runtime]`.
- `LangGraphRunEngine` on a `SqliteSaver` at `<dataDir>/checkpoints.sqlite`
  (tests may pass another checkpointer), with an `agentStep` that re-scans the
  registry for each step and cancels it after `limits.stepTimeoutMinutes`
- `doNotTouch` (`doNotTouchFor`): the orchestrator folder as `"<path>/"` with
  `/` separators, when it's inside the project
- one `RunSupervisor` with the `FsRunLease` and `forgetTrees`, shared by the
  CLI and the server ([runs-and-events](runs-and-events.md))

On top of it:

- `createProjectServices({ projectRoot })` → config + `scan` (for `npm run scan`).
- `createRunServices({ projectRoot, dataDir, fake, onEvent })` → `start`,
  `resume`, `continue`, `retry`, `outcome`, `gateChanges`, `delete` (for
  `npm run wf`). Each action goes through the supervisor, prints the events
  it watches and waits until the run stops moving; a run that crashes throws
  `RunCrashedError`. Checks the key up front.
- `createServerServices({ projectRoot, dataDir, fake })` → `ServerServices`
  (with `health()`: version, git found, data folder writable, key set) and the
  logger. Starts without a key; runs answer 503 until one is set.
- `createApp(services, report)` puts `localOnly` (ADR-0015) and a 2 MB body
  limit (413) in front of every `/api` route, then mounts the routes and the
  error handler (unknown errors go to `report`).

`main.ts` reads the environment and serves on `127.0.0.1:ORCH_PORT` (this
machine only; the web dev server proxies `/api` there), then logs
`describeSetup(config)`: the project and runtime in use and where each came
from. A config it can't use is printed like `wf` does (`formatConfigError`),
exit 1. With `ORCH_SERVE_WEB=1` (`npm start`) it also serves the built web
app from `packages/web/dist`, any non-`/api` path falling back to
`index.html`. On SIGINT / SIGTERM it calls `supervisor.shutdown()` (at most
10 s), closes the server and exits; a second signal exits at once.

`scripts/run-with-env.mjs NAME=value … -- command` sets environment variables
on any OS (`dev:sample`, `start` use it).

`core/src/index.ts` is `@orch/core` (domain + application, what the server's
routes and the web's types may use); `core/src/infrastructure/index.ts` is
`@orch/core/infrastructure` (adapters, for composition only).

## Environment

| variable | meaning |
| --- | --- |
| `CURSOR_API_KEY` | needed for `runtime: "cursor"` (env or `workflow-orchestrator/.env`) |
| `ANTHROPIC_API_KEY` | needed for `runtime: "claude"` (env or `workflow-orchestrator/.env`) |
| `ORCH_RUNTIME` | `cursor` or `claude`; overrides the config's `runtime` |
| `ORCH_SETTINGS_FILE` | another settings file instead of `settings.json`; the test runner sets it to a missing file so tests never read your settings |
| `ORCH_PROJECT_ROOT` | the project, relative to the orchestrator folder (overrides the config) |
| `ORCH_FAKE=1` | the server runs on the fake agent |
| `ORCH_ENV_FILE` | the `.env` file to load (tests point it at a missing file) |
| `ORCH_SERVE_WEB` | `1`: serve the built web app too (`npm start`) |
| `ORCH_FAKE_DELAY_MS` | how long each fake agent run takes (`dev:sample` uses 8000), so runs can be watched and cancelled |
| `ORCH_PORT` | the server's port (4317) |

## On disk

| where | owner | what |
| --- | --- | --- |
| `<project>/.cursor/skills`, `.agents/skills`, `.cursor/agents` | project | read; edited only through `/api/files` |
| `<project>/**` (any non-ignored file) | project | read; written by agents and `/api/files` |
| `<project>/.cursor/workflows/*.json`, `phases.json` | project | read and written by the orchestrator |
| `workflow-orchestrator/orchestrator.config.json` | orchestrator (committed) | read: how projects are laid out |
| `workflow-orchestrator/settings.json` | this machine (gitignored) | read: project path, runtime, models |
| `workflow-orchestrator/.env` | this machine (gitignored) | read: API keys |
| `.data/checkpoints.sqlite` | orchestrator | LangGraph state of every run |
| `.data/runs/<runId>/run.json` | orchestrator | the workflow and inputs the run started with |
| `.data/runs/<runId>/refs/<step>-<attempt>.json` | orchestrator | agent run id + before-snapshot + base tree id |
| `.data/tmp/index-*` | orchestrator | temporary git index files while a tree is recorded or diffed; removed afterwards |
| `<project's repository>/.git/refs/orchestrator/<runId>/` | git | one ref per agent attempt, keeping the tree recorded before it (and its file contents) until the run is deleted (ADR-0019) |
| `.data/project.lock` | orchestrator | the lease: which process moves which run (ADR-0018) |
| `.data/logs/server.log` | orchestrator | the server's log, JSON lines |
| `.data/runs/<runId>/events.jsonl` | orchestrator | every event, for replay |
| `.data/sample-project/` | orchestrator | the copy `npm run dev:sample` works on (`scripts/prepare-sample.mjs`) |

`.data/` is gitignored. Delete it to forget every run.

## Tests

`server/tests/composition.test.ts` (scan, a fake run finished by a second
`createRunServices`, the missing-key check); the route tests use
`createServerServices` on temp folders.
