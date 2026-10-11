# workflow-orchestrator — MVP spec

**Status:** draft, in review (2026-10-11). Slices 0–7 built; slice 7 in review. Body frozen: changes go in Amendments.

A folder you drop into a project that already has Cursor skills, agents and
artefacts. It reads them, lets you draw a workflow from them on a canvas
("BA discovery": the BA agent writes requirements → you review → the BA
agent revises), runs that workflow on Cursor agents, and shows the result as
changed files in the project: discovery documents, wiki pages, and in the
delivery phase, code.

```
my-project/                         ← the host project, already set up for Cursor
├─ .cursor/skills/requirements-elicitation/SKILL.md
├─ .cursor/agents/business-analyst.md
├─ discovery/brief.md
├─ wiki/
├─ .cursor/workflows/ba-discovery.json  ← written by the orchestrator, owned by the project
└─ workflow-orchestrator/           ← this tool, copied or cloned in
     $ npm install && npm run dev   → http://localhost:5173
```

This file is the architecture and the roadmap. Decisions with a reason
behind them are in [adr/](adr/); each slice gets its own detailed spec in
`specs/` before it is built. When a slice spec and this file disagree, **this
file is right**. Once slice 1 is built, this file changes only through its
`## Amendments` section or a new ADR.

Written against `@cursor/sdk` 1.0.37, `@langchain/langgraph` 1.4.21,
`@xyflow/react` 12.12.0, `@mui/material` 9.5.0, `react` 19.3.0, `vite` 8.3.4,
`@tanstack/react-query` 5.104.1, `zustand` 5.0.15, `vitest` 5.0.3,
`typescript` 7.0.2, Node 25.6.0, as installed on 2026-10-11. Background and
alternatives: [brainstorm.md](brainstorm.md).

## Goals of the MVP

1. Copy the folder into a configured project, `npm install`, `npm run dev`:
   the UI lists the project's skills, agents and artefacts with no setup.
2. Build a workflow on a canvas from two node types — **agent step** and
   **review gate** — and save it as a JSON file in the host project.
3. Run it. Watch each step live (tool calls, files touched, tokens). At a
   gate, read the produced files and approve, or reject with feedback, which
   sends the previous step round again.
4. Stop the server mid-run, start it again, and continue where it stopped.
5. A delivery workflow whose agent step changes code, checked by the files it
   changed.

## Non-goals of the MVP

- Parallel branches, routers, sub-workflows (roadmap after the MVP).
- Cloud agents, PR creation, multiple users, auth. Local runtime only (ADR-0004).
- A second agent runtime (Claude Agent SDK). The port allows it; no adapter yet.
- Restricting which skills an agent can see (ADR-0005).
- Deploying the orchestrator anywhere. It runs on the developer's machine.

## Vocabulary

- **Host project** — the project the orchestrator folder sits in. Owns its
  skills, agents, artefacts and workflows.
- **Skill** — a folder with a `SKILL.md` under `.cursor/skills/` or
  `.agents/skills/`. Its name is its folder's name.
- **Agent** (persona) — a `.cursor/agents/<name>.md` file: frontmatter
  `name`, `description`, optional `model`; body is the persona's instructions.
- **Artefact** — any file in the host project a step reads or writes:
  `discovery/*.md`, `wiki/**`, source code.
- **Workflow** — a graph of steps saved as `.cursor/workflows/<id>.json` in the host.
- **Phase** — a named, ordered group of workflows ("Discovery", "Delivery"),
  defined by the host in `.cursor/workflows/phases.json` (ADR-0009).
- **Step** — one node of a workflow. MVP types: `agent`, `gate`.
- **Run** — one execution of a workflow, identified by a `runId` (also the
  LangGraph `thread_id`).
- **Cursor run** — one `agent.send()` inside an agent step. A step can have
  several over its life (one per revision).

## Architecture

Every package is layered, with dependencies pointing inward: **domain →
application → adapters** (ADR-0010; rules in `workflow-orchestrator/AGENTS.md`,
checked by `tests/architecture.test.ts`).

```
packages/web        React 19 + MUI 9 + React Flow 12 + Monaco
  domain/           pure UI logic: group workflows by phase, workflow ↔ canvas nodes
  application/      hooks + the OrchestratorApi port
  api/              OrchestratorApi over HTTP + SSE
  components/ pages/ bootstrap/
     │  HTTP JSON + Server-Sent Events (via Vite proxy in dev)
packages/server     Hono on Node
  routes/           parse request → call a use case → map result
  composition.ts    creates adapters, wires them into use cases
     │  imports
packages/core       no UI, no HTTP
  domain/           Workflow, Step, Phase, Skill, AgentDef, RunState (zod);
                    validate(), buildPrompt() (ADR-0005), diffSnapshots() (ADR-0007)
  application/      use cases: scanProject, listWorkflows, saveWorkflow, startRun, resumeRun, cancelRun
                    ports: ProjectFiles, WorkflowStore, AgentRuntime, RunEngine, RunRefStore
  infrastructure/   FsProjectFiles (frontmatter via `yaml`), FsWorkflowStore,
                    CursorAgentRuntime, FakeAgentRuntime (ADR-0004),
                    LangGraphRunEngine (ADR-0003), FsRunRefStore (ADR-0006)
     │
@cursor/sdk  local agent, cwd = host project root
```

`core` depends on nothing in `server` or `web`. `web` imports `@orch/core`
with `import type` only.

## Folder layout

```
workflow-orchestrator/
├─ package.json                 npm workspaces; scripts dev, test, typecheck, smoke
├─ orchestrator.config.json     where the host is; see Config
├─ tsconfig.base.json
├─ AGENTS.md · CLAUDE.md        coding rules (CLAUDE.md imports AGENTS.md)
├─ packages/
│  ├─ core/    src/{domain,application,infrastructure}  tests/
│  ├─ server/  src/{routes,composition.ts,main.ts}       tests/
│  └─ web/     src/{domain,application,api,components,pages,bootstrap}  index.html  vite.config.ts
├─ tests/architecture.test.ts   the layer rules
├─ fixtures/sample-project/     a small configured host for tests and dev (slice 1)
└─ .data/                       gitignored: checkpoints, event logs, run refs
```

## Config

`orchestrator.config.json`, all paths relative to the orchestrator folder or
the host root as noted. Environment variable `ORCH_PROJECT_ROOT` overrides
`projectRoot` (dev and tests point it at `fixtures/sample-project`).

```json
{
  "projectRoot": "..",
  "workflowsDir": ".cursor/workflows",
  "skillDirs": [".cursor/skills", ".agents/skills"],
  "agentDirs": [".cursor/agents"],
  "artefactGlobs": ["discovery/**", "wiki/**", "delivery/**", "docs/**"],
  "defaultModel": { "id": "composer-2.5" },
  "dataDir": ".data"
}
```

`workflowsDir`, `skillDirs`, `agentDirs`, `artefactGlobs` are relative to the
host root; `dataDir` to the orchestrator folder. `CURSOR_API_KEY` comes from
the environment or `workflow-orchestrator/.env`.

## Contracts

These are what later slices build on. Changing one after slice 1 is an amendment.

### Registry

```ts
type Skill    = { name: string; path: string; description: string; body: string };
type AgentDef = { name: string; path: string; description: string; model?: string; body: string };
type Artefact = { path: string; size: number; mtimeMs: number };
type RegistryWarning = { path: string; message: string };
type Registry = { root: string; skills: Skill[]; agents: AgentDef[]; artefacts: Artefact[]; warnings: RegistryWarning[] };

scanProject(config: ResolvedConfig): Promise<Registry>
```

A skill or agent file with broken frontmatter is listed in `warnings`, not thrown.

### Workflow file

```jsonc
{
  "schema": 1,
  "id": "ba-discovery",
  "name": "BA discovery",
  "phase": "discovery",                       // Phase.id (ADR-0009)
  "inputs": [{ "id": "focus", "label": "What to focus on", "type": "text", "required": false }],
  "steps": [
    {
      "id": "elicit",
      "type": "agent",
      "label": "Write requirements",
      "agent": "business-analyst",            // AgentDef.name
      "skills": ["requirements-elicitation"], // Skill.name, required (ADR-0005)
      "instructions": "Turn discovery/brief.md into requirements. Focus: {{inputs.focus}}",
      "reads": ["discovery/brief.md"],
      "writes": ["discovery/requirements.md"],// paths or globs; checked after the run (ADR-0007)
      "model": null                           // null → agent's model → defaultModel
    },
    {
      "id": "review",
      "type": "gate",
      "label": "Review requirements",
      "shows": ["discovery/requirements.md"],
      "onReject": "elicit",
      "maxRevisions": 3
    }
  ],
  "edges": [{ "from": "elicit", "to": "review" }],
  "layout": { "elicit": { "x": 0, "y": 0 }, "review": { "x": 280, "y": 0 } }
}
```

`validate(workflow, registry)` returns a list of problems, each with a step
id: unknown agent or skill, an edge to a missing step, more than one start
step, a cycle through `edges` (loops exist only through a gate's `onReject`),
`onReject` pointing at a step that is not upstream of the gate. A workflow
with problems saves but cannot be run. A missing or unknown `phase` is a
warning only; the workflow shows under **Unsorted** and can still run.

### Phases file

`.cursor/workflows/phases.json` in the host (ADR-0009). Missing file →
`discovery`, `delivery`.

```ts
type Phase = { id: string; name: string; description?: string; order: number };
type PhasesFile = { phases: Phase[] };
```

### Run state (the LangGraph state)

```ts
type StepRecord = {
  status: "done" | "failed";
  cursorRunIds: string[];          // one per attempt
  writes: { path: string; change: "created" | "modified" | "deleted" }[];
  missing: string[];               // declared writes that did not happen
  summary: string;                 // the agent's final message
  usage?: { inputTokens: number; outputTokens: number };
  durationMs: number;
};
type GateDecision = { decision: "approve" } | { decision: "reject"; feedback: string };

type RunState = {
  workflowId: string;
  inputs: Record<string, string>;
  steps: Record<string, StepRecord>;      // reducer: merge by step id
  feedback: Record<string, string[]>;     // reducer: append per step id
  revisions: Record<string, number>;      // gate id → rejects so far
};
```

### AgentRuntime port

```ts
interface AgentRuntime {
  start(req: { cwd: string; model: { id: string }; message: string; key: string }): Promise<RunHandle>;
  attach(cursorRunId: string, cwd: string): Promise<RunHandle | null>;   // ADR-0006
}
interface RunHandle {
  id: string;
  events(): AsyncIterable<StepEvent>;
  wait(): Promise<{ status: "finished" | "error" | "cancelled"; summary: string; usage?: Usage; durationMs: number }>;
  cancel(): Promise<void>;
}
type StepEvent =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool"; callId: string; name: string; status: "running" | "completed" | "error" }
  | { kind: "status"; status: string };
```

`StepEvent` is ours, not the SDK's `SDKMessage`: the SDK says tool `args` and
`result` payloads may change, so only the stable envelope crosses the port.

### Server API

| method | path | does |
| --- | --- | --- |
| GET | `/api/project` | the registry |
| GET/PUT | `/api/files?path=` | read / write a skill, agent or artefact file (paths confined to the host root) |
| GET/PUT | `/api/phases` | the phases file (defaults if missing) |
| GET | `/api/workflows` | list `{ id, name, phase, problems }` |
| GET/PUT/DELETE | `/api/workflows/:id` | one workflow file |
| POST | `/api/workflows/:id/runs` | start a run with `inputs` → `{ runId }` |
| GET | `/api/runs` · `/api/runs/:runId` | runs; one run's state and where it stopped |
| GET | `/api/runs/:runId/events` | SSE: step started/finished, `StepEvent`s, gate waiting |
| POST | `/api/runs/:runId/resume` | a `GateDecision` for the waiting gate |
| POST | `/api/runs/:runId/cancel` | cancel the running Cursor run and stop |

## Slices

Each slice is one capability, reviewed before the next starts (repo
CLAUDE.md). Each gets a detailed spec in `specs/` first, listing the tests it
adds. Every slice ships server and web tests for what it touches and ends with
`npm run check` passing (ADR-0012).

| | slice | adds | done when | status |
| --- | --- | --- | --- | --- |
| 0 | workspace | npm workspaces, deps, tsconfig, smoke script, `/api/health`, empty canvas page; coding rules (`AGENTS.md`), layered folders, architecture + guard tests, TanStack Query, vitest node + jsdom projects with first route/hook/page tests | `npm run smoke`, `npm run check`, `npm run dev` work | done |
| 1 | registry | config loading, `ProjectFiles` port + `FsProjectFiles`, `scanProject` use case, `fixtures/sample-project`, `npm run scan` CLI (in `server`) | scan of the fixture lists 2 skills, 2 agents, its artefacts; a broken frontmatter is a warning; tests pass | done: [specs/1-registry.md](specs/1-registry.md) |
| 2 | schema + compile on a fake | domain `Workflow`/`Phase` schemas, `validate`, `buildPrompt`; `RunEngine` port + `LangGraphRunEngine`; `FakeAgentRuntime`; `MemorySaver` | a test runs agent → gate → agent: approve goes on; reject re-runs with feedback; `maxRevisions` stops the loop; no API key | done: [specs/2-schema-compile.md](specs/2-schema-compile.md) |
| 3 | Cursor runtime | `CursorRuntime`, `outputs` (ADR-0007), run refs (ADR-0006), `npm run wf -- run <id>` CLI with a terminal gate prompt | the BA workflow runs on the fixture for real and writes `discovery/requirements.md`; killing the CLI mid-step and re-running reattaches instead of starting a second Cursor run | built, in review (real Cursor run pending): [specs/3-cursor-runtime.md](specs/3-cursor-runtime.md) |
| 4 | server | Hono routes above, SQLite checkpointer, JSONL event log per run, SSE | a run started over HTTP survives a server restart and resumes at its gate; the event log replays | done: [specs/4-server.md](specs/4-server.md) |
| 5 | app shell + run views | the shell: sidebar of phases (ADR-0009) → workflows, project view (skills, agents, artefacts), runs list, run view with live events, gate panel showing the files with approve / reject. The canvas is no longer the whole page. | a full BA run done from the browser only; two phases with their workflows listed in order | done: [specs/5-shell-and-runs.md](specs/5-shell-and-runs.md) |
| 6 | workflow editor | React Flow canvas for one workflow, palette (agent step, gate), inspector with agent/skill/phase pickers, validation shown on nodes, save; new workflow inside a phase | the BA workflow can be drawn from scratch and runs the same as the hand-written JSON | built, in review: [specs/6-workflow-editor.md](specs/6-workflow-editor.md) |
| 7 | file editor | Monaco for skills, agents, artefacts; save through `/api/files` | edit a skill in the browser, re-run, the change is in the next prompt | built, in review: [specs/7-file-editor.md](specs/7-file-editor.md) |
| 8 | delivery | a delivery workflow on the fixture (implement → tests check → review), git-diff summary in the gate | a reviewed requirement turns into a code change in the fixture with the diff shown at the gate | — |

After the MVP, roughly in order: parallel steps on git worktrees, router
step, sub-workflows, phase gates (delivery waits for discovery), cloud
runtime with PRs, Claude Agent SDK runtime, cost per run, workflow
templates shared across projects.

## Review decisions (2026-10-11)

- **Persona as `systemPrompt`: no.** It replaces Cursor's built-in system
  prompt, so the agent loses its tool and editing instructions, and it is
  local-only. The persona goes first in the message. Slice 3 compares this
  with asking Cursor to delegate to the persona as a subagent (ADR-0005,
  Alternatives).
- **Workflows live in `.cursor/workflows/`** in the host, next to the skills
  and agents they use.
- **Big code diffs at a gate (slice 8):** unified diff text first; a diff
  viewer only if that turns out unreadable.
- **The UI is organised by phase** (ADR-0009), not as one canvas: phases →
  workflows in a sidebar, the canvas for one workflow at a time (slices 5–6).
- **The code follows Clean Architecture layers** (ADR-0010), with the rules
  in `workflow-orchestrator/AGENTS.md`.
- **Server data in TanStack Query, client state in Zustand, async/await
  only** (ADR-0011).
- **Every feature ships server and web tests; `npm run check` is the gate**
  (ADR-0012).

## Amendments

**2026-10-11, slice 2 — `validate` returns problems with a severity.**
Spec said: "`validate(workflow, registry)` returns a list of problems, each
with a step id."
Now: `validate(workflow, { registry, phases })` returns
`Problem = { severity: "error" | "warning"; stepId?: string; message: string }[]`.
A workflow runs when it has no errors.
Why: the same section says an unknown phase is "a warning only", and that
problem belongs to the workflow, not to a step.

**2026-10-11, slice 2 — `RunState` gains `decisions` and `stoppedAt`.**
Spec said: `RunState = { workflowId, inputs, steps, feedback, revisions }`.
Now: also `decisions: Record<gateId, GateDecision[]>` (appended, oldest
first) and `stoppedAt: string | null` (the gate that ended the run at
`maxRevisions`).
Why: the edge after a gate routes on the gate's answer, so the answer has to
be in state; and a run ended by `maxRevisions` must be told apart from a
finished one after the fact.

**2026-10-11, slice 3 — two pieces move from slice 4 to slice 3** (agreed in
review before the build).
Spec said: slice 4 adds the SQLite checkpointer; reading workflows from disk
was implied by slice 4's `/api/workflows`.
Now: slice 3 adds the SQLite checkpointer (`<dataDir>/checkpoints.sqlite`) and
the read half of a `WorkflowStore` port (`get(id)`, `phases()`). Slice 4 keeps
the HTTP routes, SSE, the event log, and listing / saving / deleting workflows.
Why: slice 3's terminal command has to survive being stopped and started
again, which needs the run state on disk.

**2026-10-11, slice 3 — `RunOutcome` gains `interrupted`; `RunEngine` gains `continue`.**
Spec said: the `RunOutcome` statuses were waiting, finished, failed, rejected.
Now: also `{ status: "interrupted"; stepId; state }` for a run whose process
stopped inside a step, and `engine.continue(runId, workflow)` re-enters that
step, which then reattaches to its agent run (ADR-0006).
Why: slice 2's open end (amendment 3 in its spec); without it a crash left a
run with no outcome.

**2026-10-11, slice 3 — `ProjectFiles.snapshot` and the `RunFiles` port.**
Spec said: `ProjectFiles` reads skills, agents and artefacts; run refs and the
run's workflow snapshot were described in ADR-0003 / ADR-0006 without a port.
Now: `ProjectFiles.snapshot(patterns) → { hashes, matches }` for the file check
(ADR-0007), and `RunFiles { saveRun, loadRun, getRef, putRef }` under
`<dataDir>/runs/<runId>/`. `resumeRun` and `continueRun` take a run id and load
the workflow from the run's snapshot instead of taking it as an argument.
Why: needed for ADR-0006 and ADR-0007; the run must continue against the
workflow it started with (ADR-0003).

**2026-10-11, slice 4 — runs move in the background; new routes and events.**
Spec said: `POST /api/workflows/:id/runs` → `{ runId }`; resume and cancel
routes; `GET …/events` streams a run's events.
Now: start, resume and continue answer `202` at once and the run moves in
the background (results arrive as events); a new `POST
/api/runs/:runId/continue` re-enters an interrupted run; `GET …/events`
replays everything after `?after=<seq>` (or `Last-Event-ID`) before live
events, with the SSE `id` set to the event's number; the log and stream also
carry `run-settled` (`{ outcome }`) and `run-crashed` (`{ message }`). Errors
map to 400 / 404 / 409 / 503 in one place.
Why: a run can take minutes before its first gate; a browser that connects
late or reconnects must not miss events.

**2026-10-11, slice 4 — `RunFiles` lists runs; `ProjectFiles` edits files.**
Spec said: `RunFiles { saveRun, loadRun, getRef, putRef }`; `/api/files`
"confined to the host root".
Now: `saveRun(runId, { workflow, inputs, startedAt })`, `listRuns()` newest
first; `ProjectFiles` adds `isEditable`, `readText`, `writeText`, and
`/api/files` only touches skill, agent and artefact files, up to 1 MB.
Why: the runs list needs a start time; "anywhere under the root" would let
the UI edit source code and secrets.

**2026-10-11, slice 5 — `react-router` joins the web app.**
Spec said: written against the packages listed at the top; routing wasn't
mentioned.
Now: `react-router` 8.4.0 (declarative mode), allowed in `web/src/pages` and
`web/src/bootstrap` only.
Why: the run view needs real addresses (reload, back button, links to a run).

**2026-10-11, slice 5.5 — a retry slice between 5 and 6.**
Spec said: slices 0–8; retrying a failed step wasn't planned.
Now: slice 5.5, [specs/5.5-retry.md](specs/5.5-retry.md): re-run a failed
agent step as a new attempt and carry on (engine, supervisor, route, CLI,
Retry button). Status: spec drafted.
Why: without it a failed step (rate limit, cancel, a stopped process) means
starting the whole run again. Agreed in the slice 5 review.

**2026-10-11, slice 5.5 built — `RunEngine.retry` and the retry route.**
Spec said: `RunEngine { start, resume, continue, outcome }`; no retry route.
Now: `RunEngine.retry(runId, workflow)` re-runs a failed run's failed step as
a new attempt (LangGraph `Command({ goto })`); `POST /api/runs/:runId/retry`
→ 202; `npm run wf -- retry <runId>`. Slice 5.5 is built and in review.
Why: [specs/5.5-retry.md](specs/5.5-retry.md).

**2026-10-11, slice 5.6 — a Claude Agent SDK runtime (planned).**
Spec said: non-goal "a second agent runtime (Claude Agent SDK). The port
allows it; no adapter yet."
Now: slice 5.6, [specs/5.6-claude-runtime.md](specs/5.6-claude-runtime.md), adds
`ClaudeAgentRuntime`, chosen per project by config (ADR-0013, proposed).
Status: spec drafted.
Why: the Cursor SDK refuses free-plan accounts even for local agents
(`plan_required`), so without a second runtime no real workflow can run on
such an account.

**2026-10-11, slice 5.7 — a local settings file.**
Spec said (Config): one `orchestrator.config.json` with `projectRoot`, and
`ORCH_PROJECT_ROOT` to override it.
Now: a gitignored `settings.json` next to it holds this machine's
`projectRoot`, `runtime` and `models`; the committed config keeps only how
projects are laid out. Precedence: flag / environment → `settings.json` →
`orchestrator.config.json` → defaults. Built:
[specs/5.7-local-settings.md](specs/5.7-local-settings.md).
Why: choosing project and provider by environment variables on every command
was error-prone; the settings UI in
[specs/proposal-settings-and-projects.md](specs/proposal-settings-and-projects.md)
is parked in favour of this.


**2026-10-11, slice 5.8 — artefacts anywhere in the project (planned).**
Spec said (Config, ADR-0007): `artefactGlobs` (default `discovery/**`,
`wiki/**`, `delivery/**`, `docs/**`) decides which artefacts are listed,
which files `/api/files` opens, and what a step's snapshot covers.
Now: slice 5.8, [specs/5.8-artefacts-anywhere.md](specs/5.8-artefacts-anywhere.md),
per ADR-0014 (proposed). Skills decide where output goes. A step's `writes` and a
gate's `shows` are optional. The snapshot covers every non-ignored project
file. `artefactGlobs` only narrows the project view. The server listens on
localhost. Status: spec drafted.
Why: projects name their folders differently (`kb/`, `ux-space/`), skills
write where their own instructions say, and delivery changes code anywhere.
Goal 1 ("no setup") didn't hold for any project not shaped like the fixture.

**2026-10-11, slice 5.8 built — artefacts anywhere in the project.**
Spec said: see the slice 5.8 entry above (planned).
Now: built as [specs/5.8-artefacts-anywhere.md](specs/5.8-artefacts-anywhere.md)
with its three build amendments. `ProjectFiles.isEditable` is now
`canOpen` (async). `snapshot(declared)` covers every project file. A new
domain function `gateFiles` decides what a gate shows. `/api/files` opens
existing project files only, except `.env*`. ADR-0014 is accepted.
Why: [ADR-0014](adr/0014-skills-own-artefact-locations.md).

**2026-10-11, slice 6 built — two workflow routes.**
Spec said (Server API): `GET /api/workflows`; `GET/PUT/DELETE
/api/workflows/:id`.
Now: also `POST /api/workflows` (`{ workflow }` → 201 `{ problems }`, 409
when the id is taken; use case `createWorkflow`) and `POST
/api/workflows/check` (`{ workflow }` → `{ problems }` without saving; a body
that isn't a workflow gives its schema problems; use case `checkWorkflow`).
`PUT` still overwrites. Built with [specs/6-workflow-editor.md](specs/6-workflow-editor.md).
Why: creating must not overwrite an existing file, and the web app can't run
`validate` itself (it imports core as types only), so the editor asks the
server.

**2026-10-11, slice 6 review — local-only server; `WorkflowStore.create`; stricter `canOpen`.**
Spec said (Server API, ports): routes answer any request; `WorkflowStore {
get, list, save, remove, phases, savePhases }`; `ProjectFiles.canOpen`
refuses `.env*` (slice 5.8).
Now: every `/api` route refuses a non-local host name or `Origin` (403) and a
non-JSON body (415), per [ADR-0015](adr/0015-server-answers-local-json-requests-only.md)
(proposed). `WorkflowStore` gains `create` (never overwrites). `canOpen` also
refuses symlinks that lead outside the project and common credential files
(see the 5.8 spec's amendment). `POST /api/workflows` answers 400 for a body
that isn't a workflow.
Why: the slice 6 security review: a page on another site could create a
workflow and start a run; DNS rebinding could read and write project files;
a committed symlink reached files outside the project.

**2026-10-11, after slice 6 — roadmap: sharing workflows across a team.**
Spec said (Slices, "After the MVP, roughly in order"): parallel steps,
router step, sub-workflows, phase gates, cloud runtime, Claude Agent SDK
runtime, cost per run, workflow templates shared across projects.
Now: one more item, early in that list: **workflows shared through git.**
Workflow files already live in the host project and are committed with it
(ADR-0001, ADR-0002); each person runs their own local orchestrator
(ADR-0015). Before teams rely on that:
- merge-friendly workflow files: a stable key order on save, and `layout`
  changes that don't make a whole-file diff (or layout kept separately);
- portable steps: model ids that work whichever runtime a person chose
  (`settings.json` is per machine), or a clear problem when they don't;
- a check after `git pull` that names skills and agents a workflow uses but
  this checkout lacks (the validator reports them today, per workflow);
- deciding whether run history is ever shared (today it stays in each
  person's `.data/`).
Why: the goal is for one BA or designer to commit a workflow and another to
pull, run and change it. Agreed after the slice 6 review.

**2026-10-11, after slice 6 — roadmap: choosing a model from the runtime's list.**
Spec said (Slices, "After the MVP"): nothing about models; ADR-0013: a step's
or agent's `model` is passed to the runtime as written, and `validate`
doesn't check model ids.
Now: one more roadmap item, **a model picker per runtime**. The editor's
Model field offers the models the chosen runtime (Cursor or Claude) actually
has, as ids with readable names, instead of free text. The list comes from
the runtime itself where its SDK can list models, otherwise from a list kept
with that runtime's adapter. The server's check warns about a model id the
current runtime doesn't know, before a run starts. This refines ADR-0013 and
needs an ADR update when it is built. It sits next to the "portable steps"
point of the team-sharing item: a model valid for one runtime isn't for the
other.
Why: typing a display name ("Opus 5.5") into the Model field was only caught
when the step ran ("There's an issue with the selected model … It may not
exist or you may not have access to it"), as a failed step.

**2026-10-11, after slice 6 — roadmap moves to roadmap.md.**
Spec said (Slices): "After the MVP, roughly in order: …" as a paragraph in
this file, and the two roadmap amendments above added items to it.
Now: the after-MVP roadmap lives in [roadmap.md](roadmap.md), a living
document edited in place. It holds that paragraph's items, the two items
from the amendments above, what is parked, what is already done (the Claude
runtime, slice 5.6), and known small debts. New roadmap ideas go there, not
into this section.
Why: roadmap items recorded as amendments get buried as later slices add
their own entries; the roadmap is a plan, not a contract, so it doesn't need
freezing.

**2026-10-11, slice 7 built — file versions; workflow list names what it uses.**
Spec said (Server API, ports): `GET/PUT /api/files` read and write
`{ content }` (PUT → 204); `GET /api/workflows` → `{ id, name, phase,
problems }`; `ProjectFiles.readText → { content, size }`, `writeText → void`.
Now: `GET /api/files` adds `version`; `PUT` takes `{ content, baseVersion? }`
and answers 200 `{ version }`, or **409** `{ error, version }` when
`baseVersion` is given and the file changed on disk since. `GET
/api/workflows` adds `agents` and `skills` (the names its steps use).
`readText` adds `version`, `writeText` returns `{ version }`. Built with
[specs/7-file-editor.md](specs/7-file-editor.md).
Why: saving in the browser must not silently overwrite what an agent or the
IDE wrote meanwhile; the editor shows which workflows use a skill or agent.
