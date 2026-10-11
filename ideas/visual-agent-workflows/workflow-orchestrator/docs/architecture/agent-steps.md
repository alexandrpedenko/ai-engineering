---
title: Agent steps
area: agent-steps
summary: One attempt of an agent step, the AgentRuntime port with its Cursor and fake runtimes, run refs that prevent paying twice, and checking outputs on disk.
code:
  - packages/core/src/application/AgentRuntime.ts
  - packages/core/src/application/runAgentStep.ts
  - packages/core/src/application/RunFiles.ts
  - packages/core/src/domain/outputs.ts
  - packages/core/src/infrastructure/CursorAgentRuntime.ts
  - packages/core/src/infrastructure/cursorMessages.ts
  - packages/core/src/infrastructure/FakeAgentRuntime.ts
  - packages/core/src/infrastructure/FsRunFiles.ts
depends_on: [prompts, project-registry]
used_by: [engine, runs-and-events]
adrs: [4, 5, 6, 7]
specs: [2-schema-compile, 3-cursor-runtime, 4-server]
updated: 2026-10-11
---

# Agent steps

**What it answers:** what happens between "this step starts" and "this step
has a result", and how do we know what it really did?

## One attempt: `runAgentStep(deps, runId, step, state)`

```
attempt = earlier runs of this step + 1
ref     = runFiles.getRef(runId, step, attempt)
if ref and runtime.attach(ref.cursorRunId) finds the run:      ← reattach (ADR-0006)
    before = ref.before; no events are forwarded again
else:
    before = snapshot(step.writes + artefactGlobs)
    handle = runtime.start({ cwd, model, message: buildPrompt(…), key: "<runId>:<stepId>:<attempt>" })
    runFiles.putRef({ …, cursorRunId: handle.id, before })      ← saved BEFORE waiting
    forward handle.events() as agent-event
onHandle(handle) … result = handle.wait() … onHandle(null)      ← lets the supervisor cancel
after   = snapshot(same patterns)
record  = { status: done | failed, cursorRunIds, writes, missing, summary, usage, durationMs }
```

`done` only when the agent run `finished`; `error` and `cancelled` → `failed`
(summary `cancelled` when empty). The registry is passed in fresh for each
step, so a skill edited between steps is used.

## Outputs are read from disk (ADR-0007)

`diffSnapshots(before, after, step.writes)` compares content hashes:
`writes` = created / modified / deleted files; `missing` = declared patterns
none of whose files changed. The agent's own summary is never used for this.

## Run refs (ADR-0006)

`RunFiles` (port) / `FsRunFiles`: `.data/runs/<runId>/run.json` (the run's
workflow, inputs, start time) and `.data/runs/<runId>/refs/<stepId>-<attempt>.json`
(the agent run id and the before-snapshot). Because the ref is written before
waiting, a process that dies mid-step can find the same agent run again on
`continue`: a finished run gives its result; a run that was cut off with its
process reports `failed` ("interrupted (its process stopped)"); only a ref
whose run can't be found at all starts a new run.

## The runtime port (ADR-0004)

```ts
interface AgentRuntime {
  start(request): Promise<RunHandle>      // { cwd, model, message, key }
  attach(runId, cwd): Promise<RunHandle | null>
}
RunHandle { id, events(): AsyncIterable<StepEvent>, wait(): Promise<AgentRunResult>, cancel() }
StepEvent = text | thinking | tool { callId, name, status } | status
```

- **`CursorAgentRuntime`**: `Agent.create({ apiKey, model, local: { cwd, settingSources: ["project"] } })`,
  `agent.send(message, { idempotencyKey })`. Maps SDK messages with
  `toStepEvents` (only the stable fields: tool args and results are dropped)
  and results with `toRunResult`. `attach` uses `Agent.getRun(id, { runtime: "local", cwd })`;
  a run still marked `running` was cut off (local runs live in the process
  that started them). The API key is removed from any error message. The two
  SDK calls are injectable for tests.
- **`FakeAgentRuntime`**: scripted replies (events, status, summary, usage,
  `writes`, `placeholders`, `dies`, `holds`, `delayMs`); records requests; reattaches
  only to runs it started; `cutOff(id)` simulates a dead process. Used by every
  test and by `--fake` / `dev:sample`.

## Tests

`core/tests/application/runAgentStep.test.ts` (refs before waiting, reattach,
cut-off, real snapshots on a temp project), `core/tests/domain/outputs.test.ts`,
`core/tests/infrastructure/{CursorAgentRuntime,cursorMessages,FakeAgentRuntime,FsRunFiles}.test.ts`.
No test calls Cursor.
