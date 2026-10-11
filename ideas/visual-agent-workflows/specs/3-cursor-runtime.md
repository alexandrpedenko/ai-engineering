# Slice 3 — the Cursor runtime

**Status:** built (2026-10-11), in review. The manual run on real Cursor is still to do.

**Capability.** Run a workflow from the terminal on real Cursor agents, in a
real project, and see what each step actually changed on disk. Stop the
command at any point, start it again, and it carries on without paying for
the same agent run twice.

```
$ npm run wf -- run ba-discovery --project ../tmp/booking --input focus=pricing
▸ elicit (business-analyst, attempt 1)
  · reading discovery/brief.md
  · edit discovery/requirements.md
✓ elicit  42 s  12.4k in / 3.1k out
    created  discovery/requirements.md

◆ review — check these files:
    discovery/requirements.md
  approve, or type feedback to reject (empty line = stop for now) ›
  Add an acceptance check to each requirement
▸ elicit (business-analyst, attempt 2)
  …
◆ review › (enter)
  stopped at review. Continue with: npm run wf -- continue run-7f3a…

$ npm run wf -- continue run-7f3a…
◆ review › y
▸ design (architect, attempt 1)
✓ design  51 s
    created  discovery/design.md
finished  run-7f3a…
```

`--fake` runs the same thing on `FakeAgentRuntime`: no key, no cost, no file
changes, for trying the flow.

Follows [../spec.md](../spec.md) (Contracts: AgentRuntime, Run state) and
ADRs 0004, 0005, 0006, 0007. Builds on slice 2's engine.

## Changes to other slices: please confirm

Two things the spec table puts in slice 4 have to come forward, because the
done-check "kill the command mid-step and re-run it" needs a run to survive
the process:

1. **The SQLite checkpointer** (`@langchain/langgraph-checkpoint-sqlite`,
   already installed in `@orch/server`) at `.data/checkpoints.sqlite`.
2. **Reading workflows and phases from disk** (`WorkflowStore.get`,
   `WorkflowStore.phases`), so the command can load
   `.cursor/workflows/<id>.json`. Listing, saving and deleting stay in slice 4.

Slice 4 then adds the HTTP routes, SSE, the event log and the write half of
the store. If you agree, both moves are recorded as spec.md amendments when
this slice is built.

## Contract changes (spec.md amendments when built)

1. **`RunOutcome` gains `interrupted`, and `RunEngine` gains `continue`.**
   `{ status: "interrupted"; stepId: string; state }` is a run whose process
   stopped inside a step (slice 2 amendment 3). `engine.continue(runId,
   workflow)` re-enters that step; the step then reattaches (ADR-0006).
2. **`ProjectFiles` gains `snapshot(patterns)`**, for the before/after file
   check (ADR-0007).
3. **New port `RunFiles`**: the run's workflow snapshot and inputs
   (ADR-0003: a run resumes against the workflow it started with) and the
   run refs (ADR-0006), under `.data/runs/<runId>/`.

## What gets added

```
packages/core/src/
  domain/
    outputs.ts               Snapshot type; diffSnapshots(before, after, declared)
  application/
    ProjectFiles.ts          + snapshot(patterns)
    RunFiles.ts              the RunFiles port; RunRef
    WorkflowStore.ts         the WorkflowStore port (read half)
    runAgentStep.ts          + snapshots, run refs, reattach
    continueRun.ts           continueRun(deps, runId) → RunOutcome
    startRun.ts              + saves the workflow snapshot and inputs
    resumeRun.ts             + loads the workflow from the snapshot
    RunEngine.ts             + continue, + "interrupted"
    errors.ts                + NotFoundError
  infrastructure/
    FsProjectFiles.ts        + snapshot
    FsRunFiles.ts            RunFiles on .data/runs/
    FsWorkflowStore.ts       WorkflowStore on .cursor/workflows/
    CursorAgentRuntime.ts    AgentRuntime on @cursor/sdk (local)
    cursorMessages.ts        toStepEvents(SDKMessage), toRunResult(RunResult)
    FakeAgentRuntime.ts      + attach to runs it started; scripted file writes
    LangGraphRunEngine.ts    + continue, + interrupted outcome
packages/server/src/
  cli/wfCommand.ts           runWfCommand(argv, deps): run | continue | status
  cli/formatRunEvent.ts      RunEvent / RunOutcome → terminal lines
  bin/wf.ts                  entry for `npm run wf`
  composition.ts             + createRunServices({ projectRoot, fake })
fixtures/sample-project/.cursor/workflows/
  ba-discovery.json          elicit → review → design
  phases.json                discovery, delivery
```

No new dependencies.

## Domain: `outputs.ts` (ADR-0007)

```ts
// File contents by path, and which paths each pattern matched.
type Snapshot = { hashes: Record<string, string>; matches: Record<string, string[]> };

diffSnapshots(before: Snapshot, after: Snapshot, declared: string[]):
  { writes: { path: string; change: "created" | "modified" | "deleted" }[]; missing: string[] }
```

- `writes`: every path whose hash appeared (created), changed (modified) or
  disappeared (deleted), sorted by path.
- `missing`: each declared pattern none of whose paths (before or after) is
  in `writes`.
- No globbing here: `matches` comes from the adapter.

## Application

### `ProjectFiles.snapshot(patterns: string[]): Promise<Snapshot>`

Hashes (SHA-1 of the content) every file matching any pattern, relative to the
host root, with the same exclusions as `artefacts()`.

### `RunFiles` port

```ts
type RunRef = { runId: string; stepId: string; attempt: number; cursorRunId: string; before: Snapshot; startedAt: string };
interface RunFiles {
  saveRun(runId: string, workflow: Workflow, inputs: Record<string, string>): Promise<void>;
  loadRun(runId: string): Promise<{ workflow: Workflow; inputs: Record<string, string> } | null>;
  getRef(runId: string, stepId: string, attempt: number): Promise<RunRef | null>;
  putRef(ref: RunRef): Promise<void>;
}
```

### `WorkflowStore` port (read half)

```ts
interface WorkflowStore {
  get(id: string): Promise<Workflow | null>;   // invalid JSON or schema → InvalidInputError naming the file
  phases(): Promise<Phase[]>;                  // DEFAULT_PHASES when phases.json is missing
}
```

### `runAgentStep`: what changes

```
attempt = runs so far + 1
ref = runFiles.getRef(runId, step, attempt)
if ref:
    handle = runtime.attach(ref.cursorRunId, cwd)
    if handle: before = ref.before; don't forward events again   ← reattached
    else:      start a new run as below (ADR-0006: no ref found → new run)
else:
    before = projectFiles.snapshot(step.writes + artefactGlobs)
    handle = runtime.start(…, key "<runId>:<stepId>:<attempt>")
    runFiles.putRef({ …, cursorRunId: handle.id, before })        ← before waiting
    forward events
result = handle.wait()
after = projectFiles.snapshot(same patterns)
{ writes, missing } = diffSnapshots(before, after, step.writes)
```

A reattached handle doesn't count as a new attempt: same attempt number, the
`cursorRunId` appears once in `cursorRunIds`.

### `RunEngine`: `continue` and `interrupted`

- `outcome()` reports `{ status: "interrupted", stepId }` where slice 2 threw.
- `continue(runId, workflow)`: only for `interrupted` (else `ConflictError`);
  re-invokes the graph from its checkpoint so the step runs again and
  reattaches.

### Use cases

- `startRun`: + `runFiles.saveRun(runId, workflow, inputs)` before the engine starts.
- `resumeRun(deps, runId, decision)` and `continueRun(deps, runId)` load the
  workflow from `runFiles.loadRun` (unknown run → `NotFoundError`), not from
  the caller. The `workflow` argument from slice 2 goes away (amendment).

## Infrastructure

### `CursorAgentRuntime` (ADR-0004)

```ts
new CursorAgentRuntime({ apiKey, sdk?: { create, getRun } })   // sdk defaults to Agent.create / Agent.getRun
```

- `start`: `Agent.create({ apiKey, model, local: { cwd, settingSources: ["project"] } })`,
  then `agent.send(message, { idempotencyKey: key })`. The handle's `events()`
  maps `run.stream()` through `toStepEvents`; `wait()` maps `run.wait()`
  through `toRunResult`, then closes the agent.
- `attach(id, cwd)`: `Agent.getRun(id, { runtime: "local", cwd })`; not found →
  `null`. A run whose status is still `running` was cut off with its process
  (local runs live in the process that started them), so its handle's
  `wait()` returns `{ status: "error", summary: "the agent run was interrupted (its process stopped)" }`.
  A finished run returns its real result.
- The API key never appears in errors, logs or events.

### `cursorMessages.ts`

- `toStepEvents(message)`: `assistant` text blocks → `text`; `thinking` →
  `thinking`; `tool_call` → `tool` (`call_id`, `name`, `status` only: the SDK
  says `args`/`result` may change); `status` → `status`. Everything else → `[]`.
- `toRunResult(result)`: `status`; `summary` = `result.result`, else
  `error.message`, else `""`; `usage` = input/output tokens; `durationMs` (0 if
  absent).

### `FsRunFiles`, `FsWorkflowStore`

- `.data/runs/<runId>/run.json` (workflow + inputs), `.data/runs/<runId>/refs/<stepId>-<attempt>.json`.
- `FsWorkflowStore` reads `<host>/<workflowsDir>/<id>.json` and `phases.json`
  with the zod schemas from slice 2.

### `FakeAgentRuntime`: what changes

- A reply may carry `writes: Record<path, content>`. The fake writes them
  under `cwd` when the run starts, so output checks can be tested.
- `attach(id)` returns the handle of a run this instance started (with its
  final result, no events), else `null`. A test can make one "cut off" to
  simulate the process dying.

## Server: `npm run wf`

```
npm run wf -- run <workflowId> [--input key=value]… [--project <path>] [--fake]
npm run wf -- continue <runId> [--project <path>] [--fake]
npm run wf -- status <runId> [--project <path>]
```

- `run`: starts, prints events as they come (`formatRunEvent`), and at each
  gate asks: `y` approves, any other text rejects with that text as feedback,
  an empty line stops (the run stays waiting).
- `continue`: an `interrupted` run re-enters its step; a `waiting` run asks at
  its gate again.
- `status`: prints the outcome and each step's record.
- Exit codes: 0 finished or stopped at a gate on purpose, 1 failed or
  rejected, 2 bad arguments, 3 missing `CURSOR_API_KEY` (not with `--fake`).
- `CURSOR_API_KEY` comes from the environment, else
  `workflow-orchestrator/.env` (`process.loadEnvFile`).
- Composition: `createRunServices({ projectRoot, fake })` builds config,
  registry, `FsProjectFiles`, `FsRunFiles`, `FsWorkflowStore`, a
  `SqliteSaver` on `<dataDir>/checkpoints.sqlite`, the runtime (Cursor or
  fake), the engine, and returns `{ start, resume, continue, outcome }`.
  `doNotTouch` is the orchestrator folder relative to the host, when it is
  inside it.
- `.data/` holds runs for every project the orchestrator was pointed at; run
  ids are unique, so they don't collide.

## Fixture

`fixtures/sample-project/.cursor/workflows/ba-discovery.json`: the slice 2
test workflow (elicit → review → design) with real instructions, phase
`discovery`. `phases.json`: discovery, delivery. `npm run scan` still shows
0 warnings.

## Tests

| file | checks |
| --- | --- |
| `core/tests/domain/outputs.test.ts` | created / modified / deleted; unchanged files ignored; a declared glob with one change isn't missing; a declared path with no change is |
| `core/tests/infrastructure/FsProjectFiles.test.ts` | + `snapshot`: hashes change with content; `matches` per pattern; exclusions |
| `core/tests/infrastructure/FsRunFiles.test.ts` | save/load run; put/get ref; unknown → null |
| `core/tests/infrastructure/FsWorkflowStore.test.ts` | the fixture workflow loads; missing → null; bad JSON / schema → `InvalidInputError` with the file; phases default and from file |
| `core/tests/infrastructure/cursorMessages.test.ts` | each SDK message type mapped (sample objects shaped like the SDK's types); `toRunResult` for finished / error / no usage |
| `core/tests/infrastructure/CursorAgentRuntime.test.ts` | with a fake `sdk`: create options (cwd, settingSources, model, idempotency key); events mapped; agent closed after wait; attach not-found → null; attach to a `running` run → interrupted error; key absent from thrown errors |
| `core/tests/application/runAgentStep.test.ts` | + writes and missing from real snapshots on a temp copy of the fixture (fake writes a file); ref saved before `wait`; existing ref + finished run → no new `start`, same attempt; ref + `attach` null → new run |
| `core/tests/application/continueRun.test.ts`, `resumeRun.test.ts`, `startRun.test.ts` | workflow from the run's snapshot; unknown run → `NotFoundError`; `saveRun` before start |
| `core/tests/infrastructure/LangGraphRunEngine.test.ts` | + a step whose process "dies" (throws) → `interrupted`; `continue` re-enters it and the fake reattaches: **one** `start` in total; `continue` on a waiting run → `ConflictError` |
| `server/tests/cli/wfCommand.test.ts` | with fake services and scripted answers: run to a gate, approve, finish; reject with text; empty line stops with the continue hint; bad args → 2; missing key → 3 |
| `server/tests/cli/formatRunEvent.test.ts` | each event and outcome as text |
| `server/tests/composition.test.ts` | + `createRunServices({ fake: true })` on a temp copy of the fixture: start → waiting; **a second `createRunServices`** (new process, same `.data`) resumes it to finished |

No test calls Cursor. No web tests: no web code.

## Done when

- `npm run check` passes.
- `npm run wf -- run ba-discovery --project <temp copy of the fixture> --fake`
  goes to the gate, approves, and finishes.
- **One manual run on real Cursor** (needs your `CURSOR_API_KEY`; spends real
  tokens, roughly two to four agent runs), on a temp copy of the fixture:
  1. `run ba-discovery` writes `discovery/requirements.md`, shown as `created`.
  2. Reject once with feedback; the second attempt's message has it.
  3. Press Ctrl-C while `design` runs, then `continue`: no second Cursor run
     for that attempt (the step reattaches and reports it was cut off, or its
     result if it had finished).
  The handover reports what happened, including anything that differed.

## Not in this slice

- Retrying a failed step (the run ends `failed`; a retry action comes with
  the server or the UI, slices 4–5).
- Cloud agents, PRs, a second runtime.
- The persona-as-subagent experiment from ADR-0005. It needs the real runtime
  this slice builds; it gets its own small spec after this slice, if you want it.
- Anything in `web`.

## Amendments

**2026-10-11, slice 3 build — two small use cases, one new error.**
Spec said: `continueRun`, `startRun`, `resumeRun` in `application/`; missing
key → exit code 3.
Now: also `loadRunWorkflow(runFiles, runId)` (the shared "find the run's
workflow or NotFoundError") and `runOutcome(deps, runId)` (outcome by run id,
NotFoundError when missing), each with a test; and `MissingCredentialsError`
in `application/errors.ts`, which the command maps to exit code 3.
Why: three use cases need the same lookup, and `status` needs an outcome by
run id; the CLI layer may only import `@orch/core`, so the error lives there.

**2026-10-11, slice 3 build — `loadConfig` takes a `dataDir` override.**
Spec said: overrides had `projectRoot` only.
Now: `loadConfig(dir, { projectRoot?, dataDir? })`;
`createRunServices({ dataDir? })` passes it.
Why: tests must not write into the real `.data/`.

**2026-10-11, slice 3 build — `AgentStepDeps` grows.**
Spec said: the steps of `runAgentStep`, not its deps.
Now: `AgentStepDeps` adds `projectFiles`, `runFiles`, `artefactGlobs` and an
optional `now()`.

**2026-10-11, slice 3 build — terminal details.**
Spec said: the example shows `▸ elicit (business-analyst, attempt 1)`; the
gate reads answers from the terminal.
Now: `▸ elicit (attempt 1)` (the event carries no agent name); the run id is
printed with the first event, so it is on screen before a Ctrl-C;
`bin/wf.ts` queues standard-input lines itself, so piped answers work and
end of input counts as "stop for now" (Node's readline closed before the
first question when input was piped); `status` never needs an API key.
Why: found by running the command with `--fake`.

**2026-10-11, slice 3 build — the real Cursor run is not done yet.**
Spec said: done when one manual run on real Cursor has been reported.
Now: no `CURSOR_API_KEY` was set (environment or `.env`), so the run hasn't
happened. Everything up to the SDK call is covered by tests against a fake
SDK shaped like the installed 1.0.37 types; the fake-agent flow was run end
to end in the terminal, including stopping at a gate and continuing in a new
process.
