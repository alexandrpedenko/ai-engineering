# Slice 5 — the app shell and run views

**Status:** done (2026-10-11).

**Capability.** Do a whole BA run from the browser: find the workflow under
its phase, start it, watch each step happen live, read the files at the gate,
approve or reject with feedback, and see the run finish. Also browse what the
orchestrator found in the project. The canvas stops being the whole page; it
comes back as the workflow editor in slice 6.

```
┌ Workflow orchestrator · sample-project ───────────────── server: up ┐
│ PROJECT          │ BA discovery                    phase: Discovery │
│  Overview        │ elicit → review → design                         │
│ DISCOVERY        │ ┌ Start a run ────────────────┐  Runs            │
│  BA discovery  ● │ │ What to focus on [pricing ] │  run-6585 waiting│
│ DELIVERY         │ │               [ Start run ] │  run-11a3 finish.│
│  (none yet)      │ └─────────────────────────────┘                  │
│ RUNS             │                                                  │
│  All runs        │                                                  │
└──────────────────┴──────────────────────────────────────────────────┘

/runs/run-6585…   BA discovery · waiting at review
  ✓ elicit   attempt 2 · 41 s · created discovery/requirements.md
  ◆ review   waiting ─────────────────────────────────────────────────
  │ discovery/requirements.md                                         │
  │ # Requirements …                                   (file contents)│
  │ Feedback [                                     ]  Reject  Approve │
  ○ design   not started
  Live: · Reading discovery/brief.md · edit · …
```

Follows [../spec.md](../spec.md), ADRs 0009 (phases), 0010 (layers), 0011
(TanStack Query + Zustand), 0012 (tests). Uses slice 4's API.

**Two halves, reviewed together or separately as you prefer:**

- **5a — shell and browsing:** routing, the sidebar of phases and workflows,
  the project page, the workflow page (read-only steps, problems, start form,
  its runs), the runs list.
- **5b — the run view:** live events over SSE, the step timeline, the gate
  panel with file contents, approve / reject / continue / cancel.

## New dependency

**`react-router` 8.4.0** (declarative mode: `BrowserRouter`, `Routes`,
`useParams`, `useNavigate`, `Link`). Allowed in `bootstrap/` and `pages/`
only; the architecture test is updated. Alternatives: `wouter` (smaller, less
common) or our own router in a Zustand store (URLs, back button and deep links
to a run would be ours to get right).

No server changes.

## Screens and routes

| route | page | shows |
| --- | --- | --- |
| `/` | → redirect to `/project` | |
| `/project` | `ProjectPage` | skills, agents, artefacts (tabs), registry warnings |
| `/workflows/:id` | `WorkflowPage` | name, phase, problems, steps in order (read-only list), start form with the workflow's inputs, this workflow's runs |
| `/runs` | `RunsPage` | all runs, newest first: workflow, status, started, busy |
| `/runs/:runId` | `RunPage` | the run view (5b) |
| anything else | `NotFoundPage` | link back to `/project` |

The shell (`AppLayout`) wraps every page: app bar (title, project folder
name, server status), sidebar, page area.

**Sidebar.** `Project → Overview`; then each phase in `order`, its workflows
under it, each with a red dot for errors or an amber dot for warnings; an
**Unsorted** group only when some workflow has no known phase; `Runs → All
runs`, with a count of runs waiting at a gate. The current page is
highlighted.

## Layers (ADR-0010)

```
web/src/
  domain/
    grouping.ts         groupWorkflowsByPhase(phases, workflows) → PhaseGroup[]  (Unsorted last, only if needed)
    problems.ts         problemCounts(problems) → { errors, warnings }
    runView.ts          stepTimeline(workflow, details, events) → StepView[]; runHeadline(details)
    eventLines.ts       eventLine(event) → FeedLine | null  (the UI's version of the CLI formatter)
    apiError.ts         ApiError { status, message, problems }
  application/
    OrchestratorApi.ts  the port, extended (below)
    queryKeys.ts        + project, phases, workflows, workflow(id), runs(filter), run(id), file(path)
    useProject.ts, usePhases.ts, useWorkflows.ts, useWorkflow.ts, useRuns.ts, useRun.ts, useFile.ts
    useStartRun.ts, useResumeRun.ts, useContinueRun.ts, useCancelRun.ts     mutations; invalidate what they change
    useRunEvents.ts     SSE → events list; updates the run's cache on run-settled (ADR-0011)
    useGateDraftStore.ts  Zustand: feedback being typed at each run's gate (survives live updates and navigation)
  api/
    HttpOrchestratorApi.ts   fetch + zod for every route used; EventSource for events
  components/
    AppSidebar, ServerStatusChip, ProblemList, RegistryTabs, StepList, StartRunForm,
    RunsTable, RunStatusChip, StepTimeline, EventFeed, GatePanel, FileView
  pages/
    AppLayout, ProjectPage, WorkflowPage, RunsPage, RunPage, NotFoundPage
  bootstrap/
    App.tsx (providers + router), routes.tsx, main.tsx, theme.ts, queryClient.ts
```

`HomePage` and `WorkflowCanvas` go (the canvas returns in slice 6).

### `OrchestratorApi` (the port)

```ts
interface OrchestratorApi {
  isServerUp(): Promise<boolean>;
  project(): Promise<Registry>;
  phases(): Promise<Phase[]>;
  workflows(): Promise<WorkflowSummary[]>;
  workflow(id: string): Promise<{ workflow: Workflow; problems: Problem[] }>;
  runs(workflowId?: string): Promise<RunSummary[]>;
  run(runId: string): Promise<RunDetails>;
  file(path: string): Promise<{ path: string; content: string }>;
  startRun(workflowId: string, inputs: Record<string, string>): Promise<{ runId: string }>;
  resume(runId: string, decision: GateDecision): Promise<void>;
  continueRun(runId: string): Promise<void>;
  cancel(runId: string): Promise<void>;
  // Calls onEvent for every event after `after`, then live ones; returns stop().
  watchRun(runId: string, after: number, onEvent: (event: LoggedEvent) => void): () => void;
}
```

Types come from `@orch/core` with `import type` (ADR-0010). A non-2xx answer
becomes an `ApiError` carrying the server's `error` and `problems`.
Responses are checked with zod in `api/` on the fields the UI reads
(`.loose()` schemas, then typed as the core type), since `web` may not run
core's own schemas.

### The run view (5b)

`stepTimeline` turns the run into one row per step, in workflow order:

| state | when |
| --- | --- |
| `done` / `failed` | the step's latest `StepRecord` |
| `running` | its latest `step-started` has no `step-finished` yet and the run is busy |
| `waiting` | it's the gate the run waits at |
| `approved` / `rejected` | a gate's last decision |
| `pending` | nothing yet |

A row shows attempts, duration, tokens, files written (created / modified /
deleted), files missing, and for gates the feedback given so far.

- **Live feed** under the running step: agent text (first line), tool calls,
  newest at the bottom, capped at 200 lines.
- **Gate panel** (when waiting): each file in `shows` loaded with
  `/api/files` and shown as monospace text (no markdown rendering in the MVP);
  a feedback box (kept in `useGateDraftStore`); **Approve**; **Reject** needs
  feedback. Both disable while the request is in flight.
- **Actions**: **Continue** when `interrupted`; **Cancel** while busy;
  outcome banners for finished / failed (with the step's summary) / rejected
  (no revisions left) / crashed.
- **Events**: `useRunEvents` opens the stream after the last event it has;
  the browser's EventSource reconnects with `Last-Event-ID` on its own. On
  `run-settled` / `run-crashed` it writes the outcome into the `run(id)` cache
  and invalidates `runs`; on `step-finished` it invalidates `run(id)`.
- After **Start run**, the app goes to the new run's page.

## Tests

| file | checks |
| --- | --- |
| `domain/grouping.test.ts` | phase order; workflows sorted by name; Unsorted only when needed; empty phases kept |
| `domain/problems.test.ts`, `domain/apiError.test.ts` | counts; message and problems kept |
| `domain/runView.test.ts` | every row state in the table above, from small hand-written runs; a rejected-then-approved gate; attempts and writes |
| `domain/eventLines.test.ts` | each event kind → line or nothing |
| `api/HttpOrchestratorApi.test.ts` | each method: URL, method, body; a 400 → `ApiError` with problems; a malformed body rejected; `watchRun` with a fake `EventSource` (URL with `after`, each event type parsed, stop closes) |
| `application/*.test.ts` | each hook on `FakeOrchestratorApi`: data, error, mutation invalidation; `useRunEvents` appends, writes the outcome on `run-settled`, stops on unmount; the draft store keeps text per run |
| `pages/AppLayout.test.tsx` | sidebar shows phases in order with their workflows, error dot, Unsorted only when needed, waiting-run count |
| `pages/ProjectPage.test.tsx` | the three tabs and the warnings |
| `pages/WorkflowPage.test.tsx` | steps, problems, start form → goes to the run; a workflow with errors can't be started (button disabled, problems shown); its runs listed |
| `pages/RunsPage.test.tsx` | the table; empty state |
| `pages/RunPage.test.tsx` | the timeline of a waiting run; the gate shows the file; approve sends approve; reject without feedback is disabled, with feedback sends it; live events appear; continue / cancel shown when they apply; 404 for an unknown run |

Pages render inside a `MemoryRouter` with `FakeOrchestratorApi`. No test
opens a network connection.

No server tests: no server code changes.

## Done when

- `npm run check` passes.
- With `npm run dev:sample`, in the browser only: open BA discovery, start a
  run, see elicit run, read `discovery/requirements.md` at the gate (the fake
  agent writes nothing, so it shows "file not found"; the fake can be given a
  reply that writes it), reject with feedback, see elicit run again, approve,
  see design run and the run finish.
- Reload the page in the middle: the run view comes back with its history.

## Not in this slice

- The canvas and editing workflows (slice 6), editing files (slice 7).
- Retrying a failed step. **Proposal:** a small slice of its own between 5
  and 6 ("5½: retry"): engine `retry(runId)` re-runs the failed step as a new
  attempt; route `POST /api/runs/:runId/retry`; a Retry button on the failed
  banner. It touches core, server and web, so it's cleaner on its own than
  folded into this one.
- Markdown rendering of files (monospace text for now).

## Amendments

**2026-10-11, slice 5 build — the fake agent writes placeholders.**
Spec said: the fake agent writes nothing, so the gate shows "file not found".
Now: `FakeAgentRuntime` replies may set `placeholders: true`; the agent then
writes a short placeholder to each plain path in the message's "You must
write" section, naming the attempt and listing any reviewer feedback.
`dev:sample` and `npm run wf -- --fake` use it. To read that section,
`buildPrompt.ts` exports `PROMPT_SECTIONS` (the headings) and
`promptSection(message, heading)`.
Why: asked for in review, so a run in the browser shows real content at the
gate and the reject loop is visible.

**2026-10-11, slice 5 build — read hooks and write hooks are grouped.**
Spec said: one file per hook (`useProject.ts`, `useStartRun.ts`, …).
Now: `application/queries.ts` (the seven read hooks plus `useFiles`) and
`application/mutations.ts` (start, resume, continue, cancel), each with one
test file; `useRunEvents.ts` and `useGateDraftStore.ts` stay on their own.
Why: each hook is three lines over the API; eleven files and eleven test
files would bury them. **This bends AGENTS.md's "one main export per file"**;
say if you'd rather they're split.

**2026-10-11, slice 5 build — smaller differences.**
- `RunDetails` (the shape of `GET /api/runs/:runId`) is a type in
  `web/src/domain/runView.ts`; core infers it but doesn't export it.
- `api/responseSchemas.ts` holds the zod checks for server answers.
- `eventLine` takes a `LoggedEvent` (it needs the seq for list keys);
  `domain/apiError.ts` also exports `isNotFound`.
- `HttpOrchestratorApi` takes an `openEventSource` function so tests can pass
  a fake `EventSource`.
- MUI 9 has no system props; layout values go in `sx` (added to AGENTS.md).
- The production bundle is 683 kB (Vite warns above 500 kB). Fine for a local
  tool; code-splitting can come with the editor in slice 6.
