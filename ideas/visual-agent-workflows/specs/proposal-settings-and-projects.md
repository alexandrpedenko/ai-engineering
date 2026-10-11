# Proposal — settings, projects and one-command start

**Status:** parked (2026-10-11). The simpler step was taken instead: slice 5.7,
a hand-edited `settings.json` ([5.7-local-settings.md](5.7-local-settings.md)).
The UI parts below stay a possible later direction; the security point (slice
A: listen on localhost only) is still open.

**The idea.** Today, choosing a project, an agent provider and a key means
environment variables and config edits:

```
ORCH_RUNTIME=claude ORCH_PROJECT_ROOT=/tmp/booking-claude npm run dev
```

Instead: one command starts the app and opens the browser; everything else
is set in the UI, and can be changed while it runs.

```
$ npm start                    (later: npx workflow-orchestrator)
  → http://localhost:4317 opens
  ┌ Settings ─────────────────────────────────────────────┐
  │ Projects      booking-app   ~/code/booking      ● open│
  │               crm           ~/work/crm                │
  │               [ + Add project ]                       │
  │ Agent         ( ) Cursor   (•) Claude                 │
  │ Models        Cursor composer-2.5 · Claude opus-5-5   │
  │ Keys          CURSOR_API_KEY     ✓ set   [Change]     │
  │               ANTHROPIC_API_KEY  ✓ set   [Test]       │
  └───────────────────────────────────────────────────────┘
```

A person can work on the CRM with Cursor on Monday and on the booking app
with Claude on Tuesday without touching a terminal again.

## Is it real? Does it make sense?

**Yes to both.** Nothing in it needs new technology; most of it is a
reshaping of composition, which the layering (ADR-0010) was built to allow:
the domain, the engine, the agent step and the providers don't change.
What makes it worth doing: it removes the most error-prone part of using the
tool today (the dev:sample / env-var confusion during slice 5.5 review is an
example), and it is the natural end point of the parked packaging idea
(`brainstorm.md`, "Parked: placing the orchestrator in a project").

**What it costs**, in order of size:

1. **Projects become a runtime choice, not a process setting.** Every service
   (registry scan, workflow store, run files, supervisor, engine) is built
   today for one project root at server start (`wire()` in composition).
   They'd be built **per project, on demand, and cached**, and every
   project-specific route moves under `/api/projects/:projectId/…`. This is
   the largest change, but mechanical: the use cases already take their
   dependencies as arguments.
2. **A run is pinned to its project and its provider.** A run started on Claude
   must continue on Claude (its run refs point at Claude sessions, ADR-0006),
   even if the settings now say Cursor. `run.json` records `runtime` and the
   model map; continue / retry / resume use the run's, not the current
   settings'. New runs use the current settings.
3. **Keys entered in the UI.** Stored by the orchestrator, never sent back
   to the browser (the API only says "set" / "not set" and can test a key).
   Stored in `~/.workflow-orchestrator/credentials.json` with owner-only file
   permissions, or the OS keychain later. Environment variables still win, for
   CI and for people who prefer them.
4. **One command to start.** A production mode where the server also serves
   the built web app on one port (no Vite), opens the browser, and is the
   `npm start` of the folder. Publishing it for `npx` is the separate,
   later step from the parked packaging idea.
5. **Security, before any of this.** The server currently listens on **all
   network interfaces** (checked 2026-10-11: `*:4317`), so anyone on the same
   network can read and write project files and start paid runs. With keys
   and a folder browser in the UI that is not acceptable: bind to
   `127.0.0.1`, reject requests whose `Host` / `Origin` isn't localhost
   (DNS-rebinding), and only then add settings. This part is small and worth
   doing first regardless of the rest.

**Limits worth knowing:**

- A browser can't hand the server a folder path (the File System Access API
  gives handles, not paths). Adding a project is a path typed or pasted,
  checked by the server, plus a small server-side folder browser
  (`GET /api/fs/dirs?path=`) limited to the user's home folder.
- Workflows stay in each project's `.cursor/workflows/` (ADR-0001/0002): the
  team's process is still versioned with the project. Only the list of known
  projects and personal settings live with the orchestrator.
- The drop-in folder (ADR-0001: `projectRoot: ".."`) becomes one way to add a
  project (it's added automatically when the orchestrator sits inside one),
  not the only way. ADR-0001 would be superseded.

## Proposed shape

### Settings (orchestrator-owned, per person)

`~/.workflow-orchestrator/settings.json` (outside any repo; the folder
`workflow-orchestrator/.data/` keeps run state as today):

```jsonc
{
  "projects": [{ "id": "booking-app", "name": "booking-app", "root": "/Users/me/code/booking" }],
  "lastProjectId": "booking-app",
  "runtime": "claude",                                   // the agent for new runs
  "models": { "cursor": "composer-2.5", "claude": "claude-opus-5-5" }
}
```

`orchestrator.config.json` keeps the project-shape settings (skill dirs,
artefact globs, workflows dir) as defaults; a project may override them later
in its own `.cursor/workflows/orchestrator.json` (not in the first slice).

### Server

```
GET/PUT  /api/settings                     runtime, models (no keys)
GET      /api/credentials                  { CURSOR_API_KEY: "set" | "missing", ANTHROPIC_API_KEY: … }
PUT      /api/credentials/:name            store a key (write-only)
POST     /api/credentials/:name/test       a cheap call with the key → ok / the provider's message
GET/POST /api/projects                     list / add { root } (validated: a folder; scanned)
DELETE   /api/projects/:projectId          forget a project (files untouched)
GET      /api/fs/dirs?path=                folders under the home directory, for the picker
/api/projects/:projectId/…                 every route that exists today under /api/
```

Composition: a `ProjectServices` cache keyed by project id (registry scan,
store, run files, engine, supervisor), built on first use. One checkpointer
and data folder for all projects; run ids are already unique.

### Web

- A **Settings** page (gear in the app bar): projects (add, open, forget),
  agent (Cursor / Claude), models, keys (set, test; never shown).
- A **project switcher** in the app bar; the sidebar shows the open
  project's phases. URLs carry the project: `/p/:projectId/workflows/:id`.
- First start with no projects: an onboarding page (add a project → choose
  the agent → add its key → test) instead of an empty app.
- A run page shows which provider and model it runs on.

## Slices, if accepted

| | slice | adds | done when |
| --- | --- | --- | --- |
| A | localhost only | bind `127.0.0.1`; Host/Origin check | requests from another machine or a foreign Origin are refused; tests for both |
| B | settings and keys | settings file, credentials store, `/api/settings`, `/api/credentials` (+ test), Settings page with agent, models and keys; runs record their runtime | switch Cursor ↔ Claude in the UI with no restart; the next run uses it; a waiting run started on the other keeps its own |
| C | projects | project registry, `/api/projects`, per-project services cache, routes under `/api/projects/:id`, folder picker, project switcher, onboarding | add two projects in the UI, run a workflow in each, switch between them while one is running |
| D | one-command start | `npm start`: build the web app, serve it from the server on one port, open the browser | a fresh clone: `npm install && npm start` and everything else is done in the browser |
| E | npx package (the parked idea) | bundle, publish, `npx workflow-orchestrator` | install-free start from any folder |

A is small and worth doing now. B is a slice like 5.6. C is the biggest (about
slice 4's size). D is small once C exists. E is separate and optional.

**Where in the roadmap:** after the workflow editor (slice 6) the app is
complete enough that settings pay off; A could come right away.

## Decisions it needs (ADRs, if accepted)

- **ADR-0014**: the orchestrator is a local app with a registry of projects;
  supersedes ADR-0001's "one folder per project". Workflows stay in projects.
- **ADR-0015**: where keys live (owner-only file now, OS keychain later;
  environment wins) and that the API never returns them.

## Open questions

1. Settings per person (`~/.workflow-orchestrator/`) or per orchestrator
   folder (`.data/`)? Per person fits "one person, many projects"; per folder
   fits the drop-in setup. Proposal: per person, with `.data/` for runs.
2. Should a project be able to fix its provider (a team on Claude only)? A
   per-project override would sit on top of the personal choice.
3. Can the provider be switched for a single run from the start form, or only
   in Settings? Proposal: Settings sets the default; the start form may
   override it for that run (it's recorded with the run anyway).
