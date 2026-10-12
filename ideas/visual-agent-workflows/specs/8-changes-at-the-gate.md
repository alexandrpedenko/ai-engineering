# Slice 8 — changes at the gate

**Status:** built (2026-10-12), in review.

**Capability.** At every gate, see **what the steps before it changed**, not
just the files' current text: for each changed file a diff (lines added and
removed), whether it is a requirements page an agent revised, a wiki page a
user story updated, or source code a delivery step wrote. Only this run's
changes are shown, not everything uncommitted in the project.

```
◆ review   waiting
  discovery/requirements.md   modified  +6 −2          [ Diff | Whole file ]  [ Edit ]
  │ @@ -12,7 +12,11 @@ ## Members
  │   R3 Members can cancel a booking so that the room is free again.
  │ - Check: cancel a booking; it disappears from "My bookings".
  │ + Check: cancel a booking; it disappears from "My bookings" and the
  │ +   room shows as free for that slot.
  │ + R4 Members can see who booked a room so that they can ask to swap.
  wiki/glossary.md            created   +14            [ Diff | Whole file ]
  src/rooms.ts                modified  +40 −3
  discovery/old-notes.md      deleted
  Feedback [                                        ]   Reject   Approve
```

Replaces the slice 8 row of [../spec.md](../spec.md) ("delivery: implement →
tests check → review, git-diff summary in the gate"); see its Amendments.
Decision: [ADR-0016](../adr/0016-gate-diffs-from-a-git-tree.md) (proposed),
refining ADR-0007.

## Decisions to review

1. **Diffs for every gate, every file kind.** The diff is not a delivery
   feature: discovery steps revise existing artefacts too, and a user story
   updates wiki pages. One mechanism for all.
2. **This run's changes only, from a git tree taken before the step.**
   Before an agent step starts, the orchestrator records the project's state
   as a git tree object (ADR-0016). The gate diffs against the tree of the
   first agent step it covers (from its `onReject` step, latest attempt). So
   after a reject, the gate shows what the **revision** changed, and earlier
   hand edits or older runs don't show up as the agent's work.
3. **No "tests check" step in this slice.** Agents can't run commands (the
   Claude runtime refuses Bash on purpose). Running a project's tests needs
   either Bash for agents or a new step type that runs a fixed command
   itself; that is a decision of its own, proposed for the roadmap as a
   **command step**. The delivery check here is implement → review.

## How a diff is taken (ADR-0016)

- **Before each agent step** (each attempt), alongside the hash snapshot of
  ADR-0007, `ProjectFiles.recordTree()` writes the working tree (tracked and
  untracked, minus gitignored files, minus the orchestrator folder) into the
  repository as a tree object and returns its id. It uses a **temporary
  index file** (seeded from the repository's index, so unchanged files aren't
  re-hashed): the person's staged changes, stash, branches and HEAD are not
  touched. The id is kept in the run ref with the snapshot and in the step's
  record (`StepRecord.baseTree`).
- **At a gate**, `gateChanges(runId, gateId)` takes the files the gate shows
  (`gateFiles`, slice 5.8), the base tree (the `baseTree` of the first agent
  step from `onReject` up to the gate), and asks `ProjectFiles.diff(baseTree,
  paths)` for each file's unified diff against the working tree now (again
  through a temporary index).
- **Per file**: `change` (created / modified / deleted, from the record),
  `added` / `removed` line counts, and `diff` (unified, 3 lines of context),
  or `diff: null` with a reason: `binary`, `too large` (over 200 kB of diff),
  or `no git` (the project isn't a git work tree, or git ignores it).
- **No git** (a plain folder, or `.data/sample-project` which this repo
  ignores): `baseTree` is null; created files show whole, changed files say
  "no diff: not a git repository", deleted files are listed.

## Server and core

| layer | change |
| --- | --- |
| core domain | `StepRecord.baseTree: string \| null`; `FileChanges = { path, change, added, removed, diff: string \| null, reason?: "binary" \| "too large" \| "no git" }[]`; `diffBaseFor(workflow, gate, state)` (the base tree, beside `gateFiles`) |
| core application | port `ProjectFiles` gains `recordTree(): Promise<string \| null>` and `diff(baseTree, paths): Promise<FileChanges>`; `runAgentStep` records the tree with the snapshot; new use case `gateChanges(deps, runId, gateId)` (NotFound for an unknown run or gate) |
| core infrastructure | `FsProjectFiles.recordTree` / `diff` with `git` via `execFile` and `GIT_INDEX_FILE` pointing at a temp file under the data dir; the `RunRef` keeps `baseTree` |
| server | `GET /api/runs/:runId/gates/:gateId/changes` → `{ files: FileChanges }` |
| CLI | at a gate, each file line gets `+added −removed` (no diff text in the terminal) |

These change the Server API, `StepRecord` and the `ProjectFiles` port in
[../spec.md](../spec.md); they go into its Amendments when built.

## Web

- `GatePanel` lists the gate's files from `useGateChanges(runId, gateId)`:
  path, change, `+added −removed`, **Diff** (default) or **Whole file**
  (today's view), and Edit (slice 7). Deleted files are listed without a
  body; a file with no diff says why and shows the whole file.
- `DiffView` (component) renders a unified diff: hunk headers, added lines
  on a green background, removed on red, context plain, line numbers of both
  sides. Monospace, no syntax highlighting.
- `parseUnifiedDiff(text)` (domain) turns diff text into hunks and lines
  with old and new line numbers, so the component only draws.
- The gate reads changes once it is waiting; a reject and new attempt fetch
  them again (a new `gate-waiting` event).

## Fixture

- `fixtures/sample-project` gains a **delivery** workflow,
  `implement-requirement.json` (phase `delivery`): `implement` (agent
  `developer`, skill `implement-requirement`, reads
  `discovery/requirements.md`, writes `src/**`) → `review` (gate, no `shows`).
- New `.cursor/agents/developer.md` and
  `.cursor/skills/implement-requirement/SKILL.md` (write the smallest change
  that meets one requirement, in `src/`, with a test beside it).
- Scan and route tests that count skills, agents or workflows are updated.

## Tests

| file | checks |
| --- | --- |
| `core/tests/domain/gateFiles.test.ts` | `diffBaseFor`: the first agent step from `onReject`, latest attempt; null when that step has no tree |
| `core/tests/infrastructure/FsProjectFiles.test.ts` | in a temp git repo: `recordTree` doesn't change `git status`, the index, stash list or HEAD; a modified, a created (untracked) and a deleted file diff correctly against the tree; a gitignored file is not in it; staged-but-uncommitted changes count as "before"; a binary file → `binary`; a huge diff → `too large`; outside git → `recordTree` null and `diff` says `no git` |
| `core/tests/application/runAgentStep.test.ts` | the record and the run ref carry the tree recorded before the agent started; reattaching keeps the original tree |
| `core/tests/application/gateChanges.test.ts` | the files and counts for a waiting gate; after a reject, the base is the new attempt's tree; unknown run or gate → NotFound |
| `server/tests/routes/runRoutes.test.ts` | the changes route on a real run in a temp git copy of the fixture: a modified artefact shows only its changed lines |
| `server/tests/cli/formatRunEvent.test.ts` | file lines with `+n −m` |
| `web/tests/domain/parseUnifiedDiff.test.ts` | hunks, line numbers on both sides, "\ No newline at end of file", an empty diff |
| `web/tests/api/HttpOrchestratorApi.test.ts`, `application/queries.test.ts` | `gateChanges` call and hook |
| `web/tests/pages/RunPage.test.tsx` | the gate shows each file's change and counts, the diff by default, Whole file switches, a deleted file has no body, a "no git" file explains itself |

## Done when

- `npm run check` passes.
- In a git copy of the sample project (`.data/sample-project` is ignored by
  this repo, so it has no diffs): copy `fixtures/sample-project` to a folder
  outside this repo, `git init` and commit it, and point `settings.json` at
  it. Then:
  1. Run BA discovery once and approve. Run it again: at the gate,
     `discovery/requirements.md` shows only the lines the second run changed.
  2. Reject with feedback: the next gate's diff shows what the revision
     changed, not the whole first attempt.
  3. Run the delivery workflow: the gate shows the new and changed files in
     `src/` as diffs.
- `git status`, `git stash list` and the staged changes in that copy are the
  same before and after the runs, apart from the files the agents wrote.

## Not in this slice

- Running the project's tests (a command step; roadmap).
- Side-by-side diffs, syntax highlighting in diffs, commenting on lines.
- Committing or reverting a step's changes from the gate.
- Diffs between two attempts of a step (the base is always "before the
  latest attempt of the first step").

## Amendments

**2026-10-12, slice 8 build — `baseTree` is optional on the record.**
Spec said: `StepRecord.baseTree: string | null`.
Now: `baseTree?: string`, absent when no tree was recorded. The run ref keeps
`baseTree: string | null`, and a ref saved before this slice reads as `null`.
Why: records already in LangGraph's checkpoints have no such field, and the
type would claim they do.

**2026-10-12, slice 8 build — the port diffs, the use case knows the change.**
Spec said: `ProjectFiles.diff(baseTree, paths): Promise<FileChanges>`, and
`change` is one of created / modified / deleted, "from the record".
Now: `diff` returns `FileDiff[]` (`path, added, removed, diff, reason?`).
`gateChanges` adds `change` from a new domain function, `gateFileChanges`,
which takes the changes of all agent steps from `onReject` up to the gate
together (created then modified is `created`; created then deleted is left
out) and lists deleted files last. `change` can also be **`unchanged`**: a
file in the gate's `shows` that no step touched (its `diff` is `""`).
Why: the adapter only sees two trees, not what each step did; and a `shows`
file can be untouched, which none of the three values described.

**2026-10-12, slice 8 build — a fourth reason: `secret`.**
Spec said: no diff with reason `binary`, `too large` or `no git`.
Now: also `secret`, for a file `canOpen` refuses as a credential file (`.env`,
keys, …). Its diff is never read. A path that isn't a plain relative path
inside the project gets the same reason.
Why: the whole-file view already refuses those files; a diff would show
their content anyway.

**2026-10-12, slice 8 build — diff text starts at the first hunk.**
Spec said: `diff` is the unified diff.
Now: `diff` is git's output from the first `@@` line on, without the
`diff --git` / `index` / `---` / `+++` header lines. `added` / `removed` are
counted from it. A deleted file has its diff and counts (`−3`), and the web
and terminal show only the counts for it, no body.
Why: the header repeats the path and the change, which the answer already
has.

**2026-10-12, slice 8 build — the terminal shows the gate from `gateChanges`.**
Spec said: at a gate, each file line gets `+added −removed`.
Now: `WfServices` gains `gateChanges(runId, gateId)`; `wf` prints
`formatGate(gateId, files)` before every gate question (including on
`continue` at a waiting run), and `formatRunEvent` prints nothing for the
`gate-waiting` event, which carries paths only. A file with no diff says why
("no diff: not a git repository").
Why: the event has no counts; one place prints the gate instead of two.

**2026-10-12, slice 8 build — web names.**
Spec said: `GatePanel` lists the files; `DiffView` draws the diff.
Now: `FileView` (used only by the gate) is replaced by `GateFileView`, one
file at a gate with its Diff / Whole file switch (local state). `DiffView`
puts added lines in `<ins>` and removed in `<del>`. `queryKeys.gateChanges`
lives under `["runs", …]`, and `useRunEvents` refreshes it on `gate-waiting`.
Whole-file text is still read through `/api/files`, for every file that
isn't deleted, when the gate opens.
Why: the gate's file view became more than a file view; `<ins>`/`<del>` say
what a line is without relying on colour.

**2026-10-12, after slice 8 — trees kept by refs (slice 9).**
Spec said: the tree is kept in the run ref and the record, "nothing left in
refs" (ADR-0016).
Now: slice 9 keeps each tree under `refs/orchestrator/<runId>/<stepId>-<attempt>`
so `git gc` can't remove it, diffs paths literally, diffs only files a
person could open (or deleted ones), and adds reason `no base`. See
[ADR-0019](../adr/0019-gate-trees-kept-by-refs.md) and
[9-hardening.md](9-hardening.md) (C1–C5).
Why: found in the 2026-10-12 review.

