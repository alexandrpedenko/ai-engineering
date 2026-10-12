---
title: Runs and events
area: runs-and-events
summary: Starting and moving runs (directly for the CLI, in the background for the server), the event log, live listeners, cancel, and listing runs.
code:
  - packages/core/src/application/prepareRun.ts
  - packages/core/src/application/loadRunWorkflow.ts
  - packages/core/src/application/runOutcome.ts
  - packages/core/src/application/listRuns.ts
  - packages/core/src/application/runDetails.ts
  - packages/core/src/application/RunSupervisor.ts
  - packages/core/src/application/EventLog.ts
  - packages/core/src/application/errors.ts
  - packages/core/src/application/RunLease.ts
  - packages/core/src/domain/runId.ts
  - packages/core/src/infrastructure/FsEventLog.ts
  - packages/core/src/infrastructure/FsRunLease.ts
depends_on: [engine, agent-steps, workflows]
used_by: [http-api, cli, composition]
adrs: [3, 6, 18, 20]
specs: [3-cursor-runtime, 4-server, 5.5-retry, 9-hardening]
updated: 2026-10-12
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
3. A gate decision (checked with `GateDecision`) resumes it; an interrupted
   run continues; a failed run retries its failed step as a new attempt.
   `runOutcome` says where it stands. Each loads the run's own workflow
   (`loadRunWorkflow`; unknown run → `NotFoundError`).

The server **and the CLI** move runs through the same `RunSupervisor`, so a
CLI run has an event log the web app can replay, and both respect the lease
below. The CLI then waits (`settled`) and prints the events it watched.

## RunSupervisor

Runs move **in the background** so callers get an answer at once:

- `start`, `resume`, `continue`, `retry` check everything that can fail fast (unknown
  workflow, invalid workflow, missing input or API key, bad decision, wrong
  status) and throw before returning; then the operation runs in the
  background. Nothing is left marked busy when one of them throws.
- **One moving run per project** (ADR-0018): moving a second run while one
  moves → `ConflictError`; so does a second operation on the same run
  ("busy"). Across processes, a **lease** (`RunLease` port, `FsRunLease`:
  `<dataDir>/project.lock` with `{ pid, runId, since }`, created exclusively)
  is taken before a run moves and given back when it settles. A lease whose
  process is gone (or a torn file) is taken over.
- **Events**: everything the engine and agent step report goes through
  `onEvent`; the supervisor numbers it (1, 2, … per run, continuing after a
  restart from the log), stamps the time, hands it to live listeners, and
  appends it to the `EventLog` in order. Each operation ends with
  **`run-settled`** `{ outcome }`, or **`run-crashed`** `{ message }` if the
  engine threw (the run is then usually `interrupted`). An append that fails
  is reported (`reportError`); the run goes on.
- **`watch(runId, after, listener)`**: replays logged events after `after`,
  then live ones, each exactly once. It waits for events already numbered but
  not yet written before reading the log, and buffers live events that arrive
  during the replay. This is what the SSE route uses.
- **A run left mid-operation** (its process stopped: the log ends without a
  `run-settled` / `run-crashed`, nothing here moves it, and no live process
  holds its lease) gets a `run-crashed` "the process moving this run stopped
  before it settled" when someone watches it, so a client never waits for it
  forever.
- **`cancel`**: cancels the agent run being waited on (the step ends
  `failed`, summary `cancelled`, and the run `failed`). The handle is known
  from the moment the agent starts, while it still streams events. If the run
  is moving but its agent call hasn't started yet, the cancel is remembered
  and applied as soon as it does. A cancel that fails in the background is
  reported, never thrown at nobody.
- **`delete(runId)`**: a run that isn't moving (here or in another process):
  its engine state, gate trees (`forgetTrees`), and folder (`run.json`,
  refs, event log). `NotFoundError` for an unknown run.
- **`shutdown()`**: refuses new operations ("the orchestrator is stopping"),
  cancels every agent run in progress and waits for each operation and its
  writes.
- `settled(runId)` waits for the current operation, any cancel and its log
  writes.

`EventLog` (port) / `FsEventLog`: `.data/runs/<runId>/events.jsonl`, one
`{ seq, at, event }` per line, each parsed with the `LoggedEvent` schema on
read (old field names converted, ADR-0020). A last line that doesn't parse (a
write cut off by a crash) is skipped; a bad line before it is an error naming
the file and line. Run ids are checked by `assertRunId` (`domain/runId.ts`)
before any path is built.

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
`ConflictError` (and `FileChangedError`), `MissingCredentialsError`,
`RunCrashedError` (the CLI's "the run stopped with an error"). Use cases throw these; the HTTP
layer and the CLI each map them in one place.

## Tests

`core/tests/application/RunSupervisor.test.ts` (background, ordering, busy,
one run per project, the lease, cancel before and while the agent streams,
a failing cancel, crash, continue, watch replay and a write still on its way,
marking a stopped run crashed, delete, shutdown), plus one test file per use
case, `core/tests/infrastructure/{FsEventLog,FsRunLease}.test.ts` and
`core/tests/domain/runId.test.ts`.
