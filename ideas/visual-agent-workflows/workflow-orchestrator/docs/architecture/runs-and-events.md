---
title: Runs and events
area: runs-and-events
summary: Starting and moving runs (directly for the CLI, in the background for the server), the event log, live listeners, cancel, and listing runs.
code:
  - packages/core/src/application/prepareRun.ts
  - packages/core/src/application/startRun.ts
  - packages/core/src/application/resumeRun.ts
  - packages/core/src/application/continueRun.ts
  - packages/core/src/application/retryRun.ts
  - packages/core/src/application/loadRunWorkflow.ts
  - packages/core/src/application/runOutcome.ts
  - packages/core/src/application/listRuns.ts
  - packages/core/src/application/runDetails.ts
  - packages/core/src/application/RunSupervisor.ts
  - packages/core/src/application/EventLog.ts
  - packages/core/src/application/errors.ts
  - packages/core/src/infrastructure/FsEventLog.ts
depends_on: [engine, agent-steps, workflows]
used_by: [http-api, cli, composition]
adrs: [3, 6]
specs: [3-cursor-runtime, 4-server, 5.5-retry]
updated: 2026-10-11
---

# Runs and events

**What it answers:** how does a run start and move, who hears about it, and
how is it stopped?

## A run's life

1. **`prepareRun`**: validate the workflow (errors → `InvalidInputError`),
   check required inputs, save `run.json` (workflow copy, inputs, start time)
   under a new id. From here on the run uses that copy, never the file
   (ADR-0003).
2. The engine runs it until it stops moving ([engine](engine.md)).
3. **`resumeRun`** (a gate decision, checked with `GateDecision`),
   **`continueRun`** (an interrupted run), **`retryRun`** (a failed run: its
   failed step again, as a new attempt), **`runOutcome`**: each loads the
   run's own workflow (`loadRunWorkflow`; unknown run → `NotFoundError`).

The **CLI** calls these directly: each call returns when the run stops moving
(`startRun` = `prepareRun` + `engine.start`).

## RunSupervisor (the server)

Runs move **in the background** so HTTP answers at once:

- `start`, `resume`, `continue`, `retry` check everything that can fail fast (unknown
  workflow, invalid workflow, missing input or API key, bad decision, wrong
  status) and throw before returning; then the operation runs in the
  background.
- **One operation per run**: a second one while it moves → `ConflictError`
  ("busy").
- **Events**: everything the engine and agent step report goes through
  `onEvent`; the supervisor numbers it (1, 2, … per run, continuing after a
  restart from the log), stamps the time, hands it to live listeners, and
  appends it to the `EventLog` in order. Each operation ends with
  **`run-settled`** `{ outcome }`, or **`run-crashed`** `{ message }` if the
  engine threw (the run is then usually `interrupted`).
- **`watch(runId, after, listener)`**: replays logged events after `after`,
  then live ones, each exactly once (live events that arrive during the
  replay are buffered). This is what the SSE route uses.
- **`cancel`**: cancels the agent run being waited on (the step ends
  `failed`, summary `cancelled`, and the run `failed`). If the run is moving
  but its agent call hasn't started yet, the cancel is remembered and applied
  as soon as it does.
- `settled(runId)` waits for the current operation and its log writes (tests
  use it).

`EventLog` (port) / `FsEventLog`: `.data/runs/<runId>/events.jsonl`, one
`{ seq, at, event }` per line.

**While a run moves, its engine outcome reads `interrupted`**: to LangGraph a
step in progress looks the same as one whose process died. Only the
supervisor knows the difference, so clients look at `busy` first (the web app
does; see `runHeadline` in [web-app](web-app.md)).

## Listing

`listRuns` (newest first, optional workflow filter; status from the engine,
`starting` when it has no state yet, plus `busy`) and `runDetails` (the run as
started, `busy`, outcome).

## Errors (`application/errors.ts`)

`InvalidConfigError`, `InvalidInputError` (with `problems`), `NotFoundError`,
`ConflictError`, `MissingCredentialsError`. Use cases throw these; the HTTP
layer and the CLI each map them in one place.

## Tests

`core/tests/application/RunSupervisor.test.ts` (background, ordering, busy,
cancel before and during the agent call, crash, continue, watch replay),
plus one test file per use case and `core/tests/infrastructure/FsEventLog.test.ts`.
