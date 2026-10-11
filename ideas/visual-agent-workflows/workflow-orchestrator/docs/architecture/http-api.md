---
title: HTTP API
area: http-api
summary: The server's routes, the Server-Sent Events stream, and how errors become status codes.
code:
  - packages/server/src/routes/**
depends_on: [runs-and-events, workflows, project-registry]
used_by: [web-app]
adrs: [10, 15]
specs: [4-server, 5.5-retry, 6-workflow-editor, 7-file-editor]
updated: 2026-10-11
---

# HTTP API

**What it answers:** what can a client ask the server, and what comes back?

Routes are thin (ADR-0010): parse the request (zod, `readJson`), call a use
case or the supervisor, return the result. They get their dependencies as
`ServerServices` from [composition](composition.md).

| method | path | answer |
| --- | --- | --- |
| GET | `/api/health` | `{ ok, node, runtime }` (`cursor`, `claude` or `fake`) |
| GET | `/api/project` | the registry |
| GET / PUT | `/api/files?path=` | `{ path, content, version }` / `{ content, baseVersion? }` → `{ version }`; **409** `{ error, version }` when `baseVersion` is given and the file changed since (existing project files inside the project, not credential files; see `canOpen` in [project-registry](project-registry.md)) |
| GET / PUT | `/api/phases` | `{ phases }` / → 204 |
| GET | `/api/workflows` | `[{ id, name, phase, agents, skills, problems }]` (`agents`, `skills`: names the steps use) |
| POST | `/api/workflows` | `{ workflow }` → **201** `{ problems }`; **400** when it isn't a workflow; **409** when the id is taken |
| POST | `/api/workflows/check` | `{ workflow }` → `{ problems }`, nothing saved (a broken draft → its schema problems, still 200) |
| GET / PUT / DELETE | `/api/workflows/:id` | `{ workflow, problems }` / `{ problems }` (PUT's body is the workflow itself, not `{ workflow }`) / 204 |
| POST | `/api/workflows/:id/runs` | `{ inputs }` → **202** `{ runId }` |
| GET | `/api/runs?workflowId=` | `[{ runId, workflowId, startedAt, status, busy }]` |
| GET | `/api/runs/:runId` | `{ runId, workflow, inputs, startedAt, busy, outcome }` |
| POST | `/api/runs/:runId/resume` · `/continue` · `/retry` · `/cancel` | **202** |
| GET | `/api/runs/:runId/events?after=` | SSE |

**Only local, JSON requests get through** (`localOnly`, ADR-0015): a host
name other than `localhost` / `127.0.0.1` / `[::1]` or a non-local `Origin`
→ 403; a body that isn't `application/json` → 415. This keeps other sites'
pages (and DNS rebinding) away from a server that has no login.

**Starting and moving a run answer 202 at once**; what happens next arrives as
events.

## The event stream

`GET /api/runs/:runId/events`: every logged event after `?after=<seq>` (or
the `Last-Event-ID` header the browser sends when it reconnects), then live
events, until the client disconnects. Each message: `id` = seq, `event` =
type (`step-started`, `agent-event`, `step-finished`, `gate-waiting`,
`run-settled`, `run-crashed`), `data` = the event as JSON. An unknown run is
a 404 before the stream opens.

## Errors (`routes/errors.ts`)

| error | status |
| --- | --- |
| `InvalidInputError` | 400 `{ error, problems }` |
| `NotFoundError` | 404 |
| `ConflictError` | 409 |
| `MissingCredentialsError` | 503 |
| anything else | 500 `{ error: "internal error" }`; details only in the server log |

## Tests

`server/tests/routes/*.test.ts`, one per route file, on `createApp` with real
services over a temp copy of the sample project and the fake agent (including
a server restart while a run waits).
