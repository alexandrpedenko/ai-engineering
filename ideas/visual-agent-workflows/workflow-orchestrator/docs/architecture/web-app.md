---
title: Web app
area: web-app
summary: The React app — its layers, routes, data hooks and live run view.
code:
  - packages/web/src/**
  - packages/web/index.html
  - packages/web/vite.config.ts
depends_on: [http-api]
used_by: []
adrs: [9, 10, 11]
specs: [5-shell-and-runs, 5.5-retry]
updated: 2026-10-11
---

# Web app

**What it answers:** how does the browser show and drive runs?

## Layers (ADR-0010)

```
domain/        pure: groupWorkflowsByPhase, problemCounts, stepTimeline, runHeadline, eventLine, ApiError
application/   OrchestratorApi (port), queries.ts, mutations.ts, useRunEvents, useGateDraftStore,
               useServerStatus, queryKeys, the API context
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
| `/project` | `ProjectPage`: skills, agents, artefacts, warnings |
| `/workflows/:id` | `WorkflowPage`: steps, problems, start form, its runs |
| `/runs` | `RunsPage` |
| `/runs/:runId` | `RunPage`: the live run |
| other | `NotFoundPage` |

`AppLayout` wraps them: app bar (project name, server status) and
`AppSidebar` (phases in order with their workflows and problem dots,
Unsorted only when needed, runs waiting at a gate).

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
  typed, per run.
- Answers are checked with zod in `api/`; errors become `ApiError` (status,
  message, problems).

## The run view

`stepTimeline(details, events)` → one row per step: `pending`, `running`
(started, not finished, run moving), `done` / `failed` (latest record),
`waiting` (the gate the run waits at), `approved` / `rejected` (a gate's last
decision). Newer `step-finished` / `run-settled` events win over the cached
details. `runHeadline` says whether the run is moving, waiting, finished,
failed, rejected, interrupted or crashed. `RunPage` adds the live feed under
the running step, the gate panel (files via `/api/files`, Approve, Reject
with feedback), Continue for interrupted runs, Retry on the failure banner, and
**Cancel this step** under the running step.

## Tests

`web/tests/domain/*`, `api/*` (fake `fetch` and `EventSource`),
`application/*` (hooks on `FakeOrchestratorApi`), `pages/*` (in a
`MemoryRouter` via `renderPage`). jsdom; no network.
