---
title: Web app
area: web-app
summary: The React app — its layers, routes, data hooks, live run view and workflow editor.
code:
  - packages/web/src/**
  - packages/web/index.html
  - packages/web/vite.config.ts
depends_on: [http-api]
used_by: []
adrs: [9, 10, 11, 14]
specs: [5-shell-and-runs, 5.5-retry, 5.8-artefacts-anywhere, 6-workflow-editor, 7-file-editor]
updated: 2026-10-11
---

# Web app

**What it answers:** how does the browser show and drive runs?

## Layers (ADR-0010)

```
domain/        pure: groupWorkflowsByPhase, problemCounts, stepTimeline, runHeadline, eventLine, ApiError,
               workflowGraph (questions), workflowEdits (edits), workflowCanvas (toCanvas)
application/   OrchestratorApi (port), queries.ts, mutations.ts, useRunEvents, useGateDraftStore,
               useWorkflowDraftStore + useWorkflowDraft, useWorkflowCheck, useServerStatus,
               queryKeys, the API context
api/           HttpOrchestratorApi (fetch + EventSource), responseSchemas (zod checks of answers)
components/    presentational only: props in, callbacks out (no hooks from application, no router)
pages/         connect hooks to components; may use react-router
bootstrap/     providers (MUI theme, QueryClient, OrchestratorApi), BrowserRouter, routes, main
```

`web` imports `@orch/core` with `import type` only.

## Routes

| path | page |
| --- | --- |
| `/` | → `/project` |
| `/project` | `ProjectPage`: skills, agents, artefacts (each opens in the file editor), warnings |
| `/workflows/:id` | `WorkflowPage`: steps, problems, start form, its runs, Edit |
| `/workflows/:id/edit` | `WorkflowEditorPage`: the workflow editor (below) |
| `/files?path=` | `FileEditorPage`: the file editor (below); loaded lazily with Monaco |
| `/runs` | `RunsPage` |
| `/runs/:runId` | `RunPage`: the live run |
| other | `NotFoundPage` |

`AppLayout` wraps them: app bar (project name, server status and the agent
runtime, from `/api/health`) and
`AppSidebar` (phases in order with their workflows and problem dots, "●" on
a workflow with an unsaved draft, "+ New workflow" under each group, Unsorted
only when needed, runs waiting at a gate). "+ New workflow" opens
`NewWorkflowDialog` (name → id with `idFromName`, refused while taken); the
workflow is created at once with one empty agent step (`newWorkflow`) and the
editor opens.

## Data (ADR-0011)

- **Server data → TanStack Query.** Read hooks in `queries.ts`, actions in
  `mutations.ts` (each invalidates what it changes). Keys in `queryKeys.ts`.
  No refetch on focus; 30 s stale time (`bootstrap/queryClient.ts`).
- **Live events → `useRunEvents(runId)`**: `api.watchRun` (an `EventSource`
  on `/events?after=`, which the browser reconnects with `Last-Event-ID`);
  keeps the run's events in order, once each; on `run-settled` writes the
  outcome into the run's cache entry and refreshes run lists; on
  `step-finished` / `run-crashed` refreshes the run.
- **Client state → Zustand**: `useGateDraftStore` keeps gate feedback being
  typed, per run; `useWorkflowDraftStore` keeps unsaved workflow drafts and
  the selected step, per workflow (memory only); `useDraftIds` gives the ids
  with drafts and re-renders only when that list changes.
- Answers are checked with zod in `api/`; errors become `ApiError` (status,
  message, problems).

## The run view

`stepTimeline(details, events)` → one row per step, in the order the run
takes them (`stepsInRunOrder`: from the start step along the edges, as the
engine runs them; the order of `steps` in the file doesn't count), each
`pending`, `running`
(started, not finished, run moving), `done` / `failed` (latest record),
`waiting` (the gate the run waits at), `approved` / `rejected` (a gate's last
decision). Newer `step-finished` / `run-settled` events win over the cached
details. `runHeadline` says whether the run is moving, waiting, finished,
failed, rejected, interrupted or crashed. `RunPage` adds the live feed under
the running step, the gate panel (the files in the run outcome's `shows`,
read via `/api/files`, each with Edit to open it in the file editor, or "No
files were changed before this gate."; Approve,
Reject with feedback), Continue for interrupted runs, Retry on the failure banner, and
**Cancel this step** under the running step.

## The workflow editor

The **draft** (a `Workflow`) is the source of truth. `useWorkflowDraft(id,
saved)` gives the draft or else the saved workflow, `dirty`, the selected
step, and `edit(change)`: every change is a pure function from
`workflowEdits` (`addStep`, `removeStep`, `renameStep`, `connect`,
`disconnect`, `moveStep`, `updateAgentStep`, `updateGate`, `updateWorkflow`,
`addInput` / `updateInput` / `removeInput`), applied to the latest draft.
Questions (`findStep`, `nextStep`, `stepsInRunOrder`, `agentStepsBefore`,
`positionOf`, the id rules) are in `workflowGraph`. The workflow page's step
list, the run timeline and the editor's next-step picker all list steps with
`stepsInRunOrder`. `toCanvas(workflow, problems, selectedId)`
turns the draft into plain nodes and edges (next-step edges, and a dashed
reject edge per gate); a step with no saved position is drawn in a row by its
place in the file, and new steps go right of every drawn node.

`WorkflowCanvas` (React Flow) draws them; it keeps its own copy of the nodes
only so nodes follow the mouse while dragged (a new canvas arriving mid-drag
leaves dragged nodes where they are), and reports gestures as edits (drag
stop → `moveStep` for every dragged node, connect → `connect`, Delete →
`removeStep` / `disconnect`). Each node is a `group` named "step <id>", with
a "has errors" / "has warnings" dot whose tooltip lists the problems. Reject edges can't be selected or deleted. `StepInspector`
edits the selected step (id with rename-everywhere, label, agent and skill
pickers from the registry, instructions, model, optional reads / writes /
shows, next step, reject target from `agentStepsBefore`); `StepPalette` adds
steps; `WorkflowFields` edits name, phase and inputs.

Problems come from the server: while there is a draft, `useWorkflowCheck`
sends it to `POST /api/workflows/check` once it has stopped changing for
400 ms, and the answer colours the nodes and fills the problem list; a failed
check is shown as such. **Save** → `PUT /api/workflows/:id`; the draft is
dropped only if nothing was edited while saving (`markSaved`). **Discard
changes** drops it; **Delete** asks first, shows a failure in the dialog, and
forgets the draft. A failed reload of the saved workflow is a banner while a
draft is open. Closing the tab with a draft asks the browser to confirm. The
route mounts the page with `key` = workflow id, so its own state starts fresh
for each workflow.

## The file editor

`FileEditorPage` (`/files?path=`) loads one file with `useFile` (text and
version, not refetched while open) and shows it in `CodeEditor`, a Monaco
wrapper (language from `languageOf`, light or dark with the app, word wrap,
⌘/Ctrl+S saves). Monaco is bundled, not fetched from a CDN:
`bootstrap/monaco.ts` hands the installed `monaco-editor` and its Vite-built
workers to the loader, and the route imports it lazily with the page, so the
rest of the app doesn't load Monaco.

`useFileDraft(path, loaded)` keeps unsaved text in `useFileDraftStore`, with
the version the first edit started from. **Save** (`useSaveFile`) sends that
version as `baseVersion`; on success the file's cache holds the saved text
and version, the project is refetched, and the draft is dropped if nothing
was typed meanwhile. A 409 shows `FileConflictAlert`: **Reload** drops the
draft and loads the disk version; **Overwrite** saves without `baseVersion`.
`FileFacts` says what the file is (`fileKind`: skill, agent, artefact or
other), which workflows use it (`usedBy`, from the workflow list's `agents`
and `skills`) and the registry's warnings for it. `useLeaveWarning` (shared
with the workflow editor) asks before closing the tab with unsaved edits.

## Tests

`web/tests/domain/*`, `api/*` (fake `fetch` and `EventSource`),
`application/*` (hooks on `FakeOrchestratorApi`), `pages/*` (in a
`MemoryRouter` via `renderPage`). jsdom; no network. Monaco needs a real
browser, so page tests replace `CodeEditor` with a textarea (`vi.mock`).
