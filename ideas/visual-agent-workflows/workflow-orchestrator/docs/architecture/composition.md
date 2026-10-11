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
  - scripts/**
depends_on: [project-registry, workflows, engine, agent-steps, runs-and-events]
used_by: [http-api, cli]
adrs: [1, 4, 8, 10]
specs: [3-cursor-runtime, 4-server]
updated: 2026-10-11
---

# Composition, config and data on disk

**What it answers:** what is real and what is fake in a given process, and
where does everything live?

## Wiring (`server/src/composition.ts`)

The only place that creates adapters (ADR-0010). One private `wire()` builds
what the CLI and the server share:

- config (`loadConfig`, after loading `workflow-orchestrator/.env` if present)
- `FsProjectFiles`, a `scan()` of the registry, `FsWorkflowStore`, `FsRunFiles`
- the agent runtime, chosen **when a step runs**: `FakeAgentRuntime` with
  placeholder writes when `fake`, else `CursorAgentRuntime` with
  `CURSOR_API_KEY` (missing → `MissingCredentialsError`)
- `LangGraphRunEngine` on a `SqliteSaver` at `<dataDir>/checkpoints.sqlite`
  (tests may pass another checkpointer), with an `agentStep` that re-scans the
  registry for each step
- `doNotTouch`: the orchestrator folder, when it's inside the project

On top of it:

- `createProjectServices({ projectRoot })` → config + `scan` (for `npm run scan`).
- `createRunServices({ projectRoot, dataDir, fake, onEvent })` → `start`,
  `resume`, `continue`, `outcome`, each running until the run stops moving
  (for `npm run wf`). Checks the key up front.
- `createServerServices({ projectRoot, dataDir, fake })` → `ServerServices`
  with a `RunSupervisor` (event log `FsEventLog`). Starts without a key; runs
  answer 503 until one is set.
- `createApp(services)` mounts the routes and the error handler.

`main.ts` reads the environment and serves on `ORCH_PORT`.

`core/src/index.ts` is `@orch/core` (domain + application, what the server's
routes and the web's types may use); `core/src/infrastructure/index.ts` is
`@orch/core/infrastructure` (adapters, for composition only).

## Environment

| variable | meaning |
| --- | --- |
| `CURSOR_API_KEY` | needed to run real agents (env or `workflow-orchestrator/.env`) |
| `ORCH_PROJECT_ROOT` | the project, relative to the orchestrator folder (overrides the config) |
| `ORCH_FAKE=1` | the server runs on the fake agent |
| `ORCH_PORT` | the server's port (4317) |

## On disk

| where | owner | what |
| --- | --- | --- |
| `<project>/.cursor/skills`, `.agents/skills`, `.cursor/agents` | project | read; edited only through `/api/files` |
| `<project>/discovery`, `wiki`, … (artefact globs) | project | read; written by agents and `/api/files` |
| `<project>/.cursor/workflows/*.json`, `phases.json` | project | read and written by the orchestrator |
| `workflow-orchestrator/orchestrator.config.json`, `.env` | orchestrator | read |
| `.data/checkpoints.sqlite` | orchestrator | LangGraph state of every run |
| `.data/runs/<runId>/run.json` | orchestrator | the workflow and inputs the run started with |
| `.data/runs/<runId>/refs/<step>-<attempt>.json` | orchestrator | agent run id + before-snapshot |
| `.data/runs/<runId>/events.jsonl` | orchestrator | every event, for replay |
| `.data/sample-project/` | orchestrator | the copy `npm run dev:sample` works on (`scripts/prepare-sample.mjs`) |

`.data/` is gitignored. Delete it to forget every run.

## Tests

`server/tests/composition.test.ts` (scan, a fake run finished by a second
`createRunServices`, the missing-key check); the route tests use
`createServerServices` on temp folders.
