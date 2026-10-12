# Slice 9 — hardening for real use

**Status:** built (2026-10-12), in review. Built in one go (agreed: no
sub-slices).

**Capability.** Everything found in the seven-part review of 2026-10-12
(code style, architecture, static checks, security, correctness, tests,
production readiness), fixed or deliberately left with a reason. Each item
has an id; the build ticks it off in the **Done** column at the end.

Decisions taken here:
[ADR-0017](../adr/0017-agent-containment.md) (what an agent may touch),
[ADR-0018](../adr/0018-one-moving-run-per-project.md) (one moving run per
project, across processes),
[ADR-0019](../adr/0019-gate-trees-kept-by-refs.md) (gate trees kept alive by
refs; refines ADR-0016),
[ADR-0020](../adr/0020-stored-data-versioned-and-read-tolerantly.md) (stored
data is versioned and read tolerantly).

## A. Agent containment (security; ADR-0017)

| id | problem | fix |
| --- | --- | --- |
| A1 | Cursor agents get the default toolset, shell included | `tools: ["read", "edit", "delete", "grep", "glob", "ls"]`: no shell, MCP, web or subagents |
| A2 | Claude agents may Write/Edit the orchestrator folder (code run by `tsx watch`), `.claude/`, `.cursor/`, `.mcp.json`; may Read `.env` | a `PreToolUse` hook denies Read/Write/Edit/Glob/Grep on protected paths; `disallowedTools` adds WebFetch, WebSearch |
| A3 | `doNotTouch` is only a sentence in the prompt | after each step, a write under a protected path fails the step ("wrote a protected file"), for every runtime |
| A4 | Claude subprocess gets the whole environment | an allow-list: PATH, HOME, USER, SHELL, TMPDIR, LANG, LC_*, TERM, plus ANTHROPIC_API_KEY |
| A5 | no turn or budget limit | config `limits.maxTurns` (Claude) and `limits.maxBudgetUsd` (Claude) |

## B. Runs that don't get stuck

| id | problem | fix |
| --- | --- | --- |
| B1 | cancel reaches the agent only after its event stream ends | `onHandle` right after start/attach, cleared in a `finally` around events and wait; fake runtime gains a streaming reply to test it |
| B2 | `watch` can miss an event recorded but not yet appended | `watch` waits for the run's pending writes before reading the log |
| B3 | `launch` marks busy before `lastSeq`; a throw leaves it busy | read `lastSeq` first; busy only once nothing can throw before the operation |
| B4 | `handle.cancel()` promise has no handler; `cancels` never cleared | handled (reported), cleared in `launch`'s finally |
| B5 | a run whose process died mid-step shows "moving" forever | `watch` on a run that isn't busy here (and isn't held by another process) whose log ends without a settle records `run-crashed` "the process running it stopped"; the run page offers Continue / Retry by the server outcome when crashed |
| B6 | torn last line in `events.jsonl` breaks the run | `FsEventLog.read` skips a last line that doesn't parse |
| B7 | `run.json` / refs written in place | temp file + rename |
| B8 | one bad `run.json` breaks the runs list | `FsRunFiles.listRuns` skips unreadable runs |
| B9 | snapshot throws on ELOOP/EACCES/ENOTDIR or a file vanishing mid-walk | those paths are skipped |
| B10 | retry or "agent run not found" takes a fresh baseline, hiding the failed attempt's edits | a new attempt after a failed attempt, or with a ref whose run is gone, keeps that ref's `before` and `baseTree` |
| B11 | `ProviderAgentRuntime.started` never pruned; Cursor agent leaks when `send` throws | prune after `result()`; close the agent on failure in `open` |
| B12 | step timeout: none | config `limits.stepTimeoutMinutes` (default 60): the step is cancelled and fails "timed out after N min" |

## C. Gate diffs (slice 8 debt; ADR-0019)

| id | problem | fix |
| --- | --- | --- |
| C1 | paths read as pathspec patterns | `--literal-pathspecs` on every git call that takes paths |
| C2 | gate paths skip `canOpen`'s rules | diff only paths that `canOpen` accepts or that the base tree has (deleted files); others → reason `secret` |
| C3 | `isSecret` is case-sensitive; symlink target not checked; denylist short | `nocase`; check the symlink target's path too; add `.git-credentials`, `credentials.json`, `*.tfvars`, `*.tfstate`, `.pgpass`, `.kube/**`, `.docker/config.json`, `.vault-token`, `*.keystore`, `*.jks`, `.htpasswd`, `service-account*.json` |
| C4 | `baseTree` not validated | must be 40 or 64 hex characters (schema and adapter); `--end-of-options` before revisions |
| C5 | trees unreferenced → `git gc` prunes them → 500 | `recordTree(name)` keeps the tree under `refs/orchestrator/<name>`; deleting a run deletes its refs; a missing tree → reason `no base` |

## D. One moving run per project (ADR-0018)

| id | problem | fix |
| --- | --- | --- |
| D1 | two runs on one project mix each other's file changes | `RunSupervisor` refuses to move a second run while one moves (409) |
| D2 | CLI and server can drive the same run at once | a lease file `<dataDir>/project.lock` `{ pid, runId, since }`, taken by every process before moving a run; a lease held by a live other process → 409 / CLI message; a dead holder's lease is taken over |
| D3 | CLI runs have no event log, so the web shows no timeline | the CLI drives runs through `RunSupervisor` too (same event log, lease, crash handling) |

## E. Stored data (ADR-0020)

| id | problem | fix |
| --- | --- | --- |
| E1 | checkpoint state cast, not parsed | `RunState` zod schema with defaults; the engine parses state it reads |
| E2 | event log lines only check `type` | `LoggedEvent` parsed with the run-state schemas |
| E3 | no version on run files | `formatVersion: 1` in `run.json` and refs (missing = 1) |
| E4 | Cursor names in stored data | `cursorRunIds` → `agentRunIds`, `cursorRunId` → `agentRunId`; old names read and converted |
| E5 | runs never deleted; `.data/tmp` never swept | `DELETE /api/runs/:runId` and `wf delete <runId>` (run folder, checkpoint thread, git refs); `.data/tmp` swept at start |

## F. Server and operations

| id | problem | fix |
| --- | --- | --- |
| F1 | no graceful shutdown | SIGINT/SIGTERM: stop accepting run actions, cancel moving agents, wait for them to settle (10 s), flush event writes, close the server |
| F2 | config error at server start → raw stack | `main.ts` prints the problems like `wf` and exits 1 |
| F3 | dev servers only | `npm start`: build the web app, the server serves it on its own port, no watch |
| F4 | SSE: `?after` beats `Last-Event-ID`; no keep-alive | header wins; a comment ping every 20 s |
| F5 | no request size limit | 2 MB body limit on `/api` |
| F6 | any local origin passes; bodyless POSTs skip the JSON check | allowed origins: same host and port, plus the Vite dev port; non-GET requests must say `application/json` |
| F7 | health checks nothing | `/api/health` adds `version`, `git` (found), `dataDir` (writable), `credentials` (set for the runtime) |
| F8 | logs are bare `console.error` | a small JSON-lines logger (stderr and `<dataDir>/logs/server.log`) |
| F9 | `run-crashed` sends raw error text | kept (local tool, the message is what helps); paths are the user's own. No change, see Left out |
| F10 | `doNotTouch` built with OS separators | normalised to `/` |
| F11 | `dev:sample` uses POSIX env syntax | a small node script sets the variables |
| F12 | `.nvmrc`, README troubleshooting, `.env.example` comment, version, CHANGELOG | added |

## G. Web

| id | problem | fix |
| --- | --- | --- |
| G1 | `onStart` passes an async function where void is expected | `start.mutate` with `onSuccess` |
| G2 | a non-JSON error body becomes `SyntaxError` | `ApiError(status, statusText)` |
| G3 | SSE: a bad event throws in the listener; no `error` handler | `safeParse`, bad events skipped; stream errors reported to `useRunEvents` as a "reconnecting" flag |
| G4 | replayed events redo cache writes; O(n²) dedupe | the hook remembers the last seq; older events are dropped before any side effect |
| G5 | no error boundary | a route `errorElement` |
| G6 | long diffs draw every line | `DiffView` draws the first 2,000 lines, then "Show all N lines" |
| G7 | `runsAll` is a prefix that refetches every run | `runLists` = `["runs", "list"]` |
| G8 | `useResumeRun` copies `useRunAction`; `void refresh` | one hook; refreshes awaited in a handler |
| G9 | gate files shaped in the page; `as GateStep` | `gateFileViews` in web domain; a type guard |
| G10 | `409` checked by hand | `isConflict` next to `isNotFound` |
| G11 | dates printed with bare `toLocaleString()` | `Intl.DateTimeFormat` with date and time styles |
| G12 | `StepNode` draws only agent steps; `GateFields` clash | `AgentStepNode`, `GateStepFields` |

## H. Code style

| id | fix |
| --- | --- |
| H1 | `runAgentStep` throws `InvalidInputError` for a missing agent or skill |
| H2 | stale Cursor-only comments fixed; ClaudeProvider comment says what, not why |
| H3 | one run-id check (`domain/runId.ts`); FsWorkflowStore uses `StepId` |
| H4 | `MAX_FILE_BYTES` used by FsProjectFiles and in messages |
| H5 | engine: one `expectStatus` |
| H6 | composition: run deps built once; "no workflow" message as elsewhere |
| H7 | `formatConfigError` shared by `wf` and `scan`; `EXIT` constants; `wf --help` |
| H8 | `ServerServices.runtimeName: RuntimeKind \| "fake"` |
| H9 | `isErrno(error, ...codes)` helper replaces the casts |
| H10 | files named after their main export (`eventLine`, `languageOf`, `usedBy`, `groupWorkflowsByPhase`, `problemCounts`, `parseMarkdown`); `useDraftIds` own file |
| H11 | exports used only in their own file are not exported |
| H12 | named constants for the text limits (160, 100, 200) |

## I. Static checks

| id | fix |
| --- | --- |
| I1 | tsconfig: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noImplicitOverride`, `noImplicitReturns`, `exactOptionalPropertyTypes` (and the errors they find) |
| I2 | oxlint (typescript-eslint doesn't support TypeScript 7): correctness rules, react-hooks, jsx-a11y, no-console outside the server's entry files, no default exports; `npm run lint` is part of `npm run check` |
| I3 | web response schemas typed against core's types where the shapes match, so casts are fewer |

## J. Tests

| id | fix |
| --- | --- |
| J1 | tests never load `.env`: `ORCH_ENV_FILE` (vitest points it at a missing file) + a guard test |
| J2 | the retry route test uses a holding fake; tests filter lists by run id |
| J3 | contract test: real server answers parse with the web's response schemas |
| J4 | `FakeProjectFiles` matches the adapter's no-git and size rules |
| J5 | providers: Cursor cancel, close on send failure, tool list; Claude env allow-list, hook denials, limits; redaction on wait/cancel/attach |
| J6 | RunSupervisor: cancel while streaming, watch during a pending write, lastSeq failure, append failure, one run per project, lease, crash detection |
| J7 | composition: `doNotTouch`, runtime rebuilt on key change, 503 on resume without key |
| J8 | web: route table test, Runs/Project error states, replayed events, error boundary |
| J9 | every fix above has its test where the fix lives |

## Left out, with reasons

- **A browser end-to-end test (Playwright).** It needs a browser download
  and a second runner; the contract test (J3) and page tests cover the same
  seams for now. Roadmap.
- **A live smoke test against real models.** Costs money per run; belongs
  behind a flag someone runs by hand. Roadmap.
- **`settingSources: []`.** The project's `.claude` / `.cursor` settings are
  how a team shapes its agents; writes to them are blocked instead (A2).
  ADR-0017 records the remaining risk.
- **Snapshot cost in big repositories.** Every step still reads and hashes
  the project twice. A git-based change list (or a stat cache) is a design
  change; recorded in the roadmap.
- **A licence.** The owner's choice.
- **Windows CI.** No CI exists yet; F10 and F11 fix what is known.
- **F9** as above.

## Done

Every id above is built, with tests, unless the line says otherwise.
`npm run check` (typecheck with the stricter flags, oxlint, 721 tests) passes.

| ids | state |
| --- | --- |
| A1–A5 | done (A2 narrowed, see Amendments) |
| B1–B12 | done |
| C1–C5 | done |
| D1–D3 | done |
| E1–E5 | done |
| F1–F8, F10–F12 | done; F9 no change (as planned) |
| G1, G2, G4–G12 | done; G3 without a "reconnecting" flag (see Amendments) |
| H1–H12 | done (H10: `apiError.ts` keeps its name) |
| I1, I2 | done |
| I3 | partly: see Amendments |
| J1–J9 | done |

Checked by hand as well, outside the test suite: `npm start` serves the app
and the API on one port and stops cleanly on Ctrl-C; a server killed mid-step
(`kill -9`) leaves its lease, the restarted server marks the run crashed when
it is watched, Continue takes the lease over and the run reaches its gate; a
second run is refused while one moves; `wf run` → reject → `wf delete` on a
git copy keeps one ref per attempt and removes them with the run.

## Amendments

**2026-10-12, build — A2: only agent configuration files are protected.**
Plan said: `.claude/`, `.cursor/` (apart from skills, agents, workflows) and
`.mcp.json` are protected. ADR-0017 said the same.
Now: protected are `.git/`, `.claude/settings.json`,
`.claude/settings.local.json`, `.claude/hooks/`, `.mcp.json`,
`.cursor/mcp.json`, `.cursor/hooks.json`, `.cursor/hooks/`, `.cursor/cli.json`,
`.cursor/environment.json`, plus `doNotTouch`. ADR-0017's text was corrected
to say so before review.
Why: `.claude/skills` and `.claude/agents` are files steps may be asked to
write; what must not change without review is what configures the agents.

**2026-10-12, build — A5: `maxTurns` has a default.**
Plan said: `limits.maxTurns` and `limits.maxBudgetUsd`, no defaults named.
Now: `limits` defaults to `{ stepTimeoutMinutes: 60, maxTurns: 200 }`;
`maxBudgetUsd` has none.
Why: a turn limit is cheap insurance against a loop; a money limit depends
on the account.

**2026-10-12, build — D3: the four run use cases are gone.**
Plan said: the CLI drives runs through `RunSupervisor`.
Now: so it does, and `startRun`, `resumeRun`, `continueRun`, `retryRun`
(used only by the CLI) are deleted with their tests. The CLI gets
`RunCrashedError` when a run crashes. The fake agent reads
`ORCH_FAKE_DELAY_MS` at each step instead of once.
Why: two ways to move a run would drift; the supervisor's tests cover the
same behaviour.

**2026-10-12, build — E5 and C5: names of the new port methods.**
Plan said: deleting a run deletes "its run folder, checkpoint thread, git
refs".
Now: `RunFiles.deleteRun`, `RunEngine.deleteRun`, `ProjectFiles.forgetTrees`,
and `ProjectFiles.recordTree(name)` takes the ref name; `RunSupervisor.delete`
calls all three.
Why: one port method per store.

**2026-10-12, build — F6: the origin must be this server's own.**
Plan said: allowed origins are the server's host and port plus the Vite dev
port.
Now: only an origin on a local host name with the port the request was sent
to. Vite's proxy keeps the browser's Host header, so the dev UI's requests
arrive addressed to port 5173 with origin `:5173` and pass; no Vite port is
configured anywhere.
Why: one rule instead of a list of ports.

**2026-10-12, build — G3: no "reconnecting" flag.**
Plan said: stream errors reported to `useRunEvents` as a reconnecting flag.
Now: bad messages are skipped; nothing is shown while the browser reconnects
(it does so by itself, and the server resumes from `Last-Event-ID`).
Why: the flag had nothing to act on; recorded as a small debt.

**2026-10-12, build — G5: an error boundary, not a route `errorElement`.**
Plan said: a route `errorElement`.
Now: `ErrorBoundary` (a component) around the routed page in `AppLayout`,
reset on navigation.
Why: `errorElement` works only with a data router; the app uses `<Routes>`.

**2026-10-12, build — G8 and H10, kept as they were.**
Plan said: `void refresh` replaced; every file named after its main export.
Now: `useRunEvents` keeps a `void` on `invalidateQueries` with a comment (it
never rejects with `throwOnError` off); `apiError.ts` keeps its name (its
main export is `ApiError`, plus the two checks on it).
Why: the change would add code without changing behaviour.

**2026-10-12, build — I2: lint choices.**
Plan said: oxlint with correctness rules, react-hooks, jsx-a11y, no-console,
no default exports.
Now: also `import/no-cycle`, `typescript/no-explicit-any`,
`no-non-null-assertion` (off in tests: AGENTS.md now allows `!` on fixture
data there), `consistent-type-imports`, `eqeqeq`. Off as not fitting this
code: `react-in-jsx-scope`, `import/default` (Vite `?worker` imports),
`jsx-a11y/prefer-tag-over-role` and `no-autofocus` (MUI), vitest's
`valid-expect` (vitest takes a message) and two style warnings. Warnings
don't fail the check; 14 remain (shadowed names, two effects that set state).
Why: the rules that catch bugs are errors; style is advice.

**2026-10-12, build — I3: web answers are still cast after a loose check.**
Plan said: web response schemas typed against core's types, so casts are
fewer.
Now: two schemas got exact (`Problem`, `GateChanges` keep optional keys out
when absent); `Registry`, `RunDetails` and the SSE events are still checked
loosely and cast. `tests/contract.test.ts` instead runs a real server and
checks every answer the web app reads parses with its schema.
Why: exact schemas for the whole run state would duplicate core's in the web
app, which may only import types; the contract test catches the drift the
casts could hide.

**2026-10-12, build — dompurify pinned in the lockfile.**
Plan said nothing; the security review found `overrides` asks for 3.4.16
while 3.4.15 was installed.
Now: the lockfile pins 3.4.16 (`npm audit`: 0 vulnerabilities; `npm ci`
installs it). npm 11 still doesn't apply the override itself, so `npm ls`
calls it "invalid" against monaco-editor's exact 3.4.15.
Why: the advisory is real; the warning is cosmetic until monaco-editor moves on.

**2026-10-12, build — version 0.9.0.**
Plan said: a version in health and a CHANGELOG.
Now: `package.json` has `"version": "0.9.0"`, served by `/api/health`;
`CHANGELOG.md` starts at 0.8.0.
Why: slice 8 was the last MVP slice; 1.0 is for after review.
