---
title: Agent steps
area: agent-steps
summary: One attempt of an agent step, the AgentRuntime port with its provider adapter (Cursor, Claude) and the fake, run refs that prevent paying twice, and checking outputs on disk.
code:
  - packages/core/src/application/AgentRuntime.ts
  - packages/core/src/application/runAgentStep.ts
  - packages/core/src/application/RunFiles.ts
  - packages/core/src/domain/outputs.ts
  - packages/core/src/domain/protectedPaths.ts
  - packages/core/src/infrastructure/agentRuntime/**
  - packages/core/src/infrastructure/FakeAgentRuntime.ts
  - packages/core/src/infrastructure/FsRunFiles.ts
  - packages/core/src/infrastructure/writeJsonAtomic.ts
depends_on: [prompts, project-registry]
used_by: [engine, runs-and-events, gate-changes]
adrs: [4, 5, 6, 7, 13, 14, 16, 17, 20]
specs: [2-schema-compile, 3-cursor-runtime, 4-server, 5.5-retry, 5.6-claude-runtime, 5.8-artefacts-anywhere, 7-file-editor, 8-changes-at-the-gate, 9-hardening]
updated: 2026-10-12
---

# Agent steps

**What it answers:** what happens between "this step starts" and "this step
has a result", and how do we know what it really did?

## One attempt: `runAgentStep(deps, runId, step, state)`

```
attempt = earlier runs of this step + 1
ref     = runFiles.getRef(runId, step, attempt)
if ref and runtime.attach(ref.agentRunId) finds the run:       ← reattach (ADR-0006)
    before, baseTree = ref's; no events are forwarded again
else:
    before, baseTree = the baseline (below)
    handle = runtime.start({ cwd, model, message: buildPrompt(…), key: "<runId>:<stepId>:<attempt>", doNotTouch })
    runFiles.putRef({ …, agentRunId: handle.id, before, baseTree })   ← saved BEFORE waiting
onHandle(handle)                                                ← cancel works from here on
forward handle.events() as agent-event … result = handle.wait() ← cancelled after limits.stepTimeoutMinutes
onHandle(null)
after   = snapshot(declared: step.writes)
record  = { status: done | failed, agentRunIds, writes, missing, summary, usage, durationMs, baseTree? }
```

**The baseline** a new attempt is measured from: the ref this attempt left
(its agent run is gone, so a new one starts over the same baseline); else,
when the previous attempt **failed**, that attempt's ref (its partial edits
count as this step's); else the project now: `snapshot(step.writes)` and
`recordTree("<runId>/<stepId>-<attempt>")` ([gate-changes](gate-changes.md)).

`done` only when the agent run `finished`; `error` and `cancelled` → `failed`
(summary `cancelled` when empty). **A step that runs past
`limits.stepTimeoutMinutes`** is cancelled and fails "timed out after N min".
**A step that changed a protected path** (below) fails "changed files it must
not touch: …". **An agent that can't be started** (the runtime's `start`
throws: wrong plan, bad key, unknown model) gives a `failed` record with
summary `couldn't start the agent: <message>` and no run ref, so the run ends
`failed` and can be retried. `writes` is every project file that changed,
wherever it is (ADR-0014); `missing` lists declared `writes` patterns that saw
no change, and is empty when the step declares none. An error **while
waiting** on a started agent is thrown instead: the run becomes `interrupted`
and `continue` reattaches. A missing agent or skill is an `InvalidInputError`.
The registry is passed in fresh for each step, so a skill edited between
steps is used.

## What an agent may touch (ADR-0017)

`isProtected(path, doNotTouch)` (`domain/protectedPaths.ts`): inside a
`doNotTouch` folder (the orchestrator folder, when it is inside the project)
or one of `AGENT_CONFIG_PATHS`: `.git/`, `.claude/settings.json`,
`.claude/settings.local.json`, `.claude/hooks/`, `.mcp.json`,
`.cursor/mcp.json`, `.cursor/hooks.json`, `.cursor/hooks/`, `.cursor/cli.json`,
`.cursor/environment.json`. Skills, agents and workflows are not protected.

- **Every runtime**: after the step, `protectedWrites(writes, doNotTouch)`
  must be empty, or the step fails.
- **Claude**: a `PreToolUse` hook (`pathGuard`) refuses file tools on a path
  outside the project, a protected path, or a credential file
  (`secretFiles`), before the tool runs. Bash, WebFetch and WebSearch are
  disallowed. The subprocess gets an allow-listed environment (`claudeEnv`:
  PATH, HOME, locale and a few OS variables, plus `ANTHROPIC_API_KEY`).
  `limits.maxTurns` and `limits.maxBudgetUsd` are passed through.
- **Cursor**: only the built-in tools in `CURSOR_TOOLS` (`read`, `edit`,
  `delete`, `grep`, `glob`, `ls`): no shell, MCP, web or subagents. It has no
  hook, so a protected write is caught afterwards.

## Outputs are read from disk (ADR-0007)

`diffSnapshots(before, after, step.writes)` compares content hashes:
`writes` = created / modified / deleted files; `missing` = declared patterns
none of whose files changed. The agent's own summary is never used for this.

## Run refs (ADR-0006)

`RunFiles` (port) / `FsRunFiles`: `.data/runs/<runId>/run.json` (the run's
workflow, inputs, start time) and `.data/runs/<runId>/refs/<stepId>-<attempt>.json`
(the agent run id, the before-snapshot and the base tree). Both files carry
`formatVersion: 1`, are written whole (`writeJsonAtomic`: temporary file +
rename), and are parsed on read; a ref written before slice 9 (`cursorRunId`,
no `baseTree`) is converted (ADR-0020). `listRuns` leaves out (and reports) a
run whose `run.json` can't be read; `deleteRun` removes the run's folder. Because the ref is written before
waiting, a process that dies mid-step can find the same agent run again on
`continue`: a finished run gives its result; a run that was cut off with its
process reports `failed` ("interrupted (its process stopped)"); only a ref
whose run can't be found at all starts a new run.

## The runtime port (ADR-0004, ADR-0013)

```ts
interface AgentRuntime {
  start(request): Promise<RunHandle>      // { cwd, model, message, key, subagents? }
  attach(runId, cwd): Promise<RunHandle | null>
}
RunHandle { id, events(): AsyncIterable<StepEvent>, wait(): Promise<AgentRunResult>, cancel() }
StepEvent = text | thinking | tool { callId, name, status } | status
```

**One adapter, a strategy per provider** (`infrastructure/agentRuntime/`):

```
ProviderAgentRuntime (implements AgentRuntime)   ──uses──►  AgentProvider
  · removes the API key from error messages                  ├─ CursorProvider   (@cursor/sdk)
  · remembers runs it started → attach in the same process   └─ ClaudeProvider   (@anthropic-ai/claude-agent-sdk)
    (forgotten once their result has been read)
  · find() "cut-off" → interrupted error; null → null
createAgentProvider(kind, apiKey, limits) · CREDENTIALS { cursor: CURSOR_API_KEY, claude: ANTHROPIC_API_KEY }
```

An `AgentProvider` only knows its SDK: `open(request)` starts a run (and
**rejects if the agent can't start**, so the step fails cleanly), `find(id, cwd)`
looks one up after a restart (`ProviderRun`, `"cut-off"` or `null`).

- **`CursorProvider`**: `Agent.create({ apiKey, model, local: { cwd, settingSources: ["project"] }, tools: CURSOR_TOOLS })`,
  `agent.send(message, { idempotencyKey })` (the agent is closed when the send fails). Maps SDK messages with
  `toStepEvents` (only stable fields: tool args and results are dropped) and
  results with `toRunResult`. `find` uses `Agent.getRun(id, { runtime: "local", cwd })`;
  a run still `running` was cut off. Ignores `subagents` (Cursor reads
  `.cursor/agents` itself).
- **`ClaudeProvider`**: `query({ prompt, options })` with `cwd`, the model,
  Claude Code's system prompt (`preset: "claude_code"`), `settingSources: ["project"]`,
  the project's agents as `agents`, `permissionMode: "acceptEdits"`, allowed
  `Read`/`Write`/`Edit`/`Glob`/`Grep`/`Skill`/`Task`, **`Bash`, `WebFetch`,
  `WebSearch` disallowed**, the `pathGuard` hook, the limits, a new
  `sessionId` per run, an `AbortController` for cancel, and `claudeEnv` as
  `env`. A `ClaudeRun` reads the stream once in the background: `open`
  returns when Claude's `system/init` arrives (or rejects with what stopped it);
  events go through an `AsyncQueue`; `ClaudeEventMapper` turns messages into
  events (remembering each tool call's name for its result) and the `result`
  message into an `AgentRunResult` (input tokens include cache reads). `find`
  always answers `"cut-off"`: Claude runs inside our process (ADR-0013).
- Both SDK entry points are injectable (`CursorSdk`, `ClaudeQuery`) for tests.
- **`FakeAgentRuntime`** (not a provider; implements the port directly):
  scripted replies, or a function giving one per start (events, status,
  summary, usage, `writes`, `placeholders`, `dies`, `holds`, `streams`,
  `delayMs`, `startFails`); records requests; reattaches only
  to runs it started; `cutOff(id)` simulates a dead process. Used by every test
  and by `--fake` / `dev:sample`. Its placeholder files quote the skills the
  step was told to follow and the reviewer feedback it was given, so a changed
  skill is visible in what it writes.

## Tests

`core/tests/application/runAgentStep.test.ts` (refs before waiting, reattach,
cut-off, cancel while streaming, timeout, protected writes, baselines of a
retry and of a lost agent run, real snapshots on a temp project),
`core/tests/domain/{outputs,protectedPaths}.test.ts`,
`core/tests/infrastructure/writeJsonAtomic.test.ts`,
`core/tests/infrastructure/{FakeAgentRuntime,FsRunFiles}.test.ts`,
`core/tests/infrastructure/agentRuntime/**` (the shared runtime on a fake
provider, the queue, the factory, each provider on a fake SDK: tools, limits,
environment, the path guard). No test calls
Cursor or Claude.
