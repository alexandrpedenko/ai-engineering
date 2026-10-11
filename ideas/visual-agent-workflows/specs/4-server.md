# Slice 4 — the server

**Status:** built (2026-10-11), in review.

**Capability.** Everything the terminal command can do, over HTTP, so the
web app (slice 5) can do it: see the project, read and save workflows and
phases, start a run and get its id straight away, watch it live over
Server-Sent Events, answer gates, continue, cancel. A browser that connects
late, or reconnects, gets every event it missed.

```
$ npm run dev:sample        # server on :4317 against a temp copy of the sample project, fake agent
$ curl -X POST localhost:4317/api/workflows/ba-discovery/runs -d '{"inputs":{"focus":"pricing"}}'
{"runId":"run-1a2b3c4d"}                                       ← 202, the run goes on in the background
$ curl -N localhost:4317/api/runs/run-1a2b3c4d/events
id: 1   event: step-started    data: {"stepId":"elicit","attempt":1}
id: 2   event: step-finished   data: {"stepId":"elicit","record":{…}}
id: 3   event: gate-waiting    data: {"gateId":"review","shows":["discovery/requirements.md"]}
id: 4   event: run-settled     data: {"outcome":{"status":"waiting",…}}
$ curl -X POST localhost:4317/api/runs/run-1a2b3c4d/resume -d '{"decision":"approve"}'
```

Follows [../spec.md](../spec.md) (Contracts → Server API, as amended) and
ADRs 0001, 0003, 0006, 0009, 0010, 0012. Builds on slice 3's run services.

## Contract changes (spec.md amendments when built)

1. **Starting, resuming and continuing return at once (`202`); the run goes
   on in the background.** spec.md says `POST …/runs` returns `{ runId }`.
   A run can take minutes before its first gate, longer than an HTTP request
   should wait. Resume and continue return `202` too. Results arrive as
   events.
2. **New route `POST /api/runs/:runId/continue`** for an `interrupted` run
   (slice 3's outcome).
3. **`GET /api/runs/:runId/events` replays.** `?after=<seq>` (or the
   `Last-Event-ID` header) sends every logged event after that number, then
   live ones. Each SSE message's `id` is the event's sequence number.
4. **Two events beyond `RunEvent`, in the log and the stream only:**
   `run-settled` (`{ outcome }`, sent whenever a run stops moving: at a
   gate, finished, failed, rejected, interrupted) and `run-crashed`
   (`{ message }`, when the engine throws). Together they're `LogEvent`.
5. **`RunFiles` gains `listRuns()`**, and `run.json` gains `startedAt`.
6. **`ProjectFiles` gains `readText(path)` / `writeText(path, content)`**
   for `/api/files`, limited to skill, agent and artefact files.

## What gets added

```
packages/core/src/
  domain/
    logEvent.ts             LogEvent, LoggedEvent ({ seq, at, event })
  application/
    EventLog.ts             the EventLog port
    WorkflowStore.ts        + list(), save(workflow), remove(id), savePhases(phases)
    RunFiles.ts             + listRuns(); saveRun records startedAt
    ProjectFiles.ts         + readText, writeText, isEditable
    prepareRun.ts           checks + saves a run, returns its id (startRun = prepareRun + engine.start)
    RunSupervisor.ts        runs in the background, one operation per run, events to log + subscribers, cancel
    listWorkflows.ts        workflows with their problems
    saveWorkflow.ts         id must match; problems returned, save still happens (ADR-0002)
    runAgentStep.ts         + reports its handle so the supervisor can cancel it
  infrastructure/
    FsEventLog.ts           <dataDir>/runs/<runId>/events.jsonl
    FsWorkflowStore.ts      + write half
    FsRunFiles.ts           + listRuns
    FsProjectFiles.ts       + readText / writeText / isEditable
packages/server/src/
  routes/
    projectRoutes.ts        GET /api/project; GET/PUT /api/files
    phaseRoutes.ts          GET/PUT /api/phases
    workflowRoutes.ts       GET /api/workflows; GET/PUT/DELETE /api/workflows/:id; POST …/:id/runs
    runRoutes.ts            GET /api/runs, /api/runs/:runId; POST resume / continue / cancel
    eventRoutes.ts          GET /api/runs/:runId/events (SSE)
    errors.ts               the one place errors become HTTP responses
  composition.ts            + createServerServices(options); createApp(services)
  main.ts                   reads ORCH_PROJECT_ROOT / ORCH_FAKE / ORCH_PORT
```

No new dependencies (`hono/streaming` ships with Hono; `picomatch` is
already installed through `tinyglobby` and becomes a direct dependency of
`@orch/core` for `isEditable`).

## Application

### `RunSupervisor`

```ts
new RunSupervisor({ engine, runFiles, eventLog, store, registry: () => Promise<Registry>, newId, now })

start(workflowId, inputs): Promise<{ runId }>    // checks, saves, then runs in the background
resume(runId, decision: unknown): Promise<void>  // checks the decision and that the run is waiting, then background
continue(runId): Promise<void>                   // checks it's interrupted, then background
cancel(runId): Promise<void>                     // cancels the agent run of the step in progress
isBusy(runId): boolean
subscribe(runId, listener: (e: LoggedEvent) => void): () => void
```

- **Checks happen before returning**, so the caller gets `400` / `404` /
  `409` at once: unknown workflow, a workflow with errors, a missing input, a
  bad decision, a run not waiting (resume) or not interrupted (continue).
- **One operation per run.** While a run is moving, another start, resume or
  continue on it is a `ConflictError` ("run is busy").
- Every `RunEvent` from the engine and the agent step is numbered (1, 2, …
  per run), stamped with the time, appended to the `EventLog`, then passed to
  subscribers. When the operation ends, `run-settled` with the outcome; if
  it throws, `run-crashed` with the message, and the run stays where the
  engine left it (usually `interrupted`).
- **Cancel**: the agent step reports its `RunHandle` while it waits;
  `cancel` calls `handle.cancel()`. The Cursor run ends `cancelled`, the step
  is `failed` with summary `cancelled`, and the run ends `failed`. Cancelling
  a run that isn't in an agent step → `ConflictError`.
- The registry is scanned again for each operation, so a skill edited between
  runs is in the next prompt (slice 7 depends on this).
- A run left moving when the server stopped shows as `interrupted` on the
  next start; nothing continues it automatically.

### `WorkflowStore`: the write half

```ts
list(): Promise<{ id: string; workflow: Workflow | null; error?: string }[]>  // a broken file is listed with its error
save(workflow: Workflow): Promise<void>       // pretty JSON, 2 spaces, trailing newline
remove(id: string): Promise<void>             // NotFoundError when missing
savePhases(phases: Phase[]): Promise<void>
```

`listWorkflows(store, registry)` returns `{ id, name, phase, problems }` per
file (`problems` from `validate`, or one error for a broken file).
`saveWorkflow` refuses a body whose `id` isn't the URL's, saves, and returns
the problems (ADR-0002: a workflow with errors saves but can't run).

### `ProjectFiles`: editing files

`isEditable(path)`: a relative path, no `..`, not under the orchestrator
folder, `.git` or `node_modules`, and matching a skill dir (`**/*.md`), an
agent dir (`*.md`) or an artefact glob. `readText` / `writeText` refuse
anything else (`InvalidInputError`), and files over 1 MB.

## Server

### Routes

| method | path | body → answer |
| --- | --- | --- |
| GET | `/api/health` | `{ ok, node }` (unchanged) |
| GET | `/api/project` | `Registry` |
| GET | `/api/files?path=` | `{ path, content }` |
| PUT | `/api/files?path=` | `{ content }` → `204` |
| GET | `/api/phases` | `{ phases }` (defaults when there's no file) |
| PUT | `/api/phases` | `{ phases }` → `204` |
| GET | `/api/workflows` | `[{ id, name, phase, problems }]` |
| GET | `/api/workflows/:id` | `{ workflow, problems }` |
| PUT | `/api/workflows/:id` | `Workflow` → `{ problems }` |
| DELETE | `/api/workflows/:id` | `204` |
| POST | `/api/workflows/:id/runs` | `{ inputs }` → `202 { runId }` |
| GET | `/api/runs?workflowId=` | `[{ runId, workflowId, startedAt, status, busy }]`, newest first |
| GET | `/api/runs/:runId` | `{ runId, workflow, inputs, startedAt, busy, outcome }` |
| POST | `/api/runs/:runId/resume` | `GateDecision` → `202` |
| POST | `/api/runs/:runId/continue` | → `202` |
| POST | `/api/runs/:runId/cancel` | → `202` |
| GET | `/api/runs/:runId/events?after=` | SSE: `id` = seq, `event` = type, `data` = JSON |

Every body is parsed with zod in the route. Routes call use cases or the
supervisor and map results; no logic.

### Errors (`routes/errors.ts`)

| error | status | body |
| --- | --- | --- |
| `InvalidInputError` | 400 | `{ error, problems }` |
| `NotFoundError` | 404 | `{ error }` |
| `ConflictError` | 409 | `{ error }` |
| `MissingCredentialsError` | 503 | `{ error: "CURSOR_API_KEY is not set" }` |
| anything else | 500 | `{ error: "internal error" }`, details logged to the console only |

### Starting the server

- `main.ts`: `ORCH_PROJECT_ROOT`, `ORCH_FAKE=1` (fake agent), `ORCH_PORT`
  (default 4317).
- The server starts without `CURSOR_API_KEY`; browsing works, and starting a
  run answers `503` until it's set (or `ORCH_FAKE=1`).
- New root script `dev:sample`: copies `fixtures/sample-project` to
  `.data/sample-project` (once) and runs `dev` against it with the fake
  agent, so trying the app never edits the fixture.
- `createApp(services)` takes its services; `createServerServices(options)`
  builds them. Tests build them on a temp copy of the fixture.

## Tests

| file | checks |
| --- | --- |
| `core/tests/application/RunSupervisor.test.ts` | start returns before the run moves; events numbered and logged in order, then `run-settled`; a second operation while busy → `ConflictError`; resume refused when not waiting; bad decision → `InvalidInputError`; cancel during a step → step failed `cancelled`, run failed; engine throws → `run-crashed`; subscribers stop on unsubscribe |
| `core/tests/application/prepareRun.test.ts`, `startRun.test.ts` | checks and save moved; `startRun` unchanged for the CLI |
| `core/tests/application/listWorkflows.test.ts`, `saveWorkflow.test.ts` | problems per workflow; broken file listed; id mismatch refused; workflow with errors still saved |
| `core/tests/infrastructure/FsEventLog.test.ts` | append, read all, read after a seq, survives a new instance |
| `core/tests/infrastructure/FsWorkflowStore.test.ts` | + list (incl. a broken file), save then get, remove, savePhases |
| `core/tests/infrastructure/FsRunFiles.test.ts` | + listRuns newest first |
| `core/tests/infrastructure/FsProjectFiles.test.ts` | + isEditable (each rule), readText/writeText refuse outside paths and big files |
| `server/tests/routes/*.test.ts` | one file per route file, on `createApp` with services on a temp copy of the fixture and the fake agent: status codes and bodies for each row above, error mapping |
| `server/tests/routes/eventRoutes.test.ts` | a run's stream from the start to `run-settled`; `?after=2` skips 1–2; `Last-Event-ID` does the same; unknown run → 404 |
| `server/tests/routes/errors.test.ts` | each error → its status and body; a 500 doesn't leak the message |

No web tests: no web code (ADR-0012; slice 5 adds the client and its tests).

## Done when

- `npm run check` passes.
- `npm run dev:sample`, then with `curl`: start the BA run, watch its
  events, approve at the gate, see `run-settled` with `finished`.
- Stop the server while a run waits at its gate, start it again: `GET
  /api/runs/:id` still says `waiting`; resuming it works.

## Not in this slice

- The web client and every screen (slice 5).
- Retrying a failed step (its own small spec, before or with slice 5).
- Auth, CORS beyond the Vite proxy, more than one user.
- Watching the project folder for changes (the registry is re-scanned per
  request and per run operation instead).

## Amendments

**2026-10-11, slice 4 build — `LogEvent` lives in `application/EventLog.ts`.**
Spec said: `domain/logEvent.ts`.
Now: `LogEvent` and `LoggedEvent` are in `application/EventLog.ts`, next to
the port.
Why: `run-settled` carries a `RunOutcome`, which is an application type; the
domain may not import from the application layer.

**2026-10-11, slice 4 build — more small use cases, one per file.**
Spec said: `prepareRun`, `listWorkflows`, `saveWorkflow`, `RunSupervisor`.
Now: also `readWorkflow`, `savePhases`, `readProjectFile` / `writeProjectFile`
(`projectFile.ts`), `listRuns`, `runDetails`, each with tests; on the server,
`routes/readJson.ts` (a body that isn't JSON → 400) and
`routes/ServerServices.ts` (the type routes receive).
Why: routes may only parse and call use cases (AGENTS.md); each of these was
logic a route would otherwise hold.

**2026-10-11, slice 4 build — `saveRun` takes the whole run; `startRun` needs a clock.**
Spec said: `RunFiles` "gains `listRuns()`, and `run.json` gains `startedAt`".
Now: `saveRun(runId, { workflow, inputs, startedAt })`; `prepareRun` and
`startRun` take `now()`.

**2026-10-11, slice 4 build — cancel before the agent call is remembered.**
Spec said: cancelling a run that isn't in an agent step → `ConflictError`.
Now: cancelling a run that is moving but hasn't reached its agent call yet
is remembered and applied the moment it does; only a run that isn't moving
is a `ConflictError`. The supervisor also has `settled(runId)` (wait for the
current operation and its log writes), used by tests and the routes' tests.
Why: found by the supervisor test: a Cancel pressed right after Start hit
the gap between the run starting and its agent run existing.

**2026-10-11, slice 4 build — registry re-scanned per agent step.**
Spec said: per run operation.
Now: per agent step (and per request for the routes).
Why: same effect for slice 7, simpler wiring, and an edit made while a run
waits at a gate reaches the step after the gate.

**2026-10-11, slice 4 build — dependencies.**
Spec said: `picomatch` "already installed through `tinyglobby`".
Now: pinned to 4.0.7 (the version `tinyglobby` already used, so it dedupes),
with `@types/picomatch` 4.0.3; `zod` 4.6.5 is now a declared dependency of
`@orch/server` (routes parse bodies with it).
