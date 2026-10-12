---
title: Architecture overview
area: overview
summary: How the orchestrator is put together, how a run flows through it, and where each part is described.
code:
  - packages/*/package.json
depends_on: []
used_by: [project-registry, workflows, prompts, engine, agent-steps, gate-changes, runs-and-events, http-api, cli, composition, web-app, quality-gates]
adrs: [1, 8, 10]
specs: []
updated: 2026-10-12
---

# Architecture overview

The workflow orchestrator reads a project's Cursor skills and agents, lets a
team define workflows from them (agent steps and review gates, grouped by
phase), runs those workflows on Cursor agents, and shows what each step
changed on disk.

These documents describe **the system as it is built now**. They are kept up
to date with the code (see [quality-gates](quality-gates.md)). Two other
kinds of document sit next to them:

- **Specs** (`../../../specs/`, `../../../spec.md`): the plan for each slice,
  frozen once built; changes are appended as amendments.
- **ADRs** (`../../../adr/`): why a decision was made.

When a doc and the code disagree, the code is right and the doc is a bug.

## Map

| area | doc | in one line |
| --- | --- | --- |
| project-registry | [project-registry.md](project-registry.md) | config; reading skills, agents and artefacts from the project; editing their files |
| workflows | [workflows.md](workflows.md) | the workflow and phase files, validation, the workflow store |
| prompts | [prompts.md](prompts.md) | how an agent step becomes the message an agent receives |
| engine | [engine.md](engine.md) | LangGraph: steps as nodes, gates as interrupts, outcomes, continue |
| agent-steps | [agent-steps.md](agent-steps.md) | one agent step: runtime port, Cursor and fake runtimes, run refs, file checks |
| gate-changes | [gate-changes.md](gate-changes.md) | what the steps before a gate changed: a git tree before each step, a diff per file |
| runs-and-events | [runs-and-events.md](runs-and-events.md) | starting and moving runs, background operations, the event log, cancel |
| http-api | [http-api.md](http-api.md) | routes, SSE, how errors become status codes |
| cli | [cli.md](cli.md) | `npm run scan`, `npm run wf` |
| composition | [composition.md](composition.md) | wiring adapters into use cases; config, env, and what lives on disk |
| web-app | [web-app.md](web-app.md) | the React app: layers, routing, data hooks, the run view |
| quality-gates | [quality-gates.md](quality-gates.md) | `npm run check`, the architecture, guard and docs tests, fakes |

## Layers

Every package is split the same way; imports only point inward
(ADR-0010, enforced by `tests/architecture.test.ts`):

```
domain        pure rules and types              core/src/domain, web/src/domain
application   use cases, hooks, ports           core/src/application, web/src/application
adapters      file system, Cursor, LangGraph,   core/src/infrastructure, server/src/{routes,cli},
              HTTP, React components             web/src/{api,components,pages}
composition   creates adapters, wires them      server/src/{composition.ts,main.ts,bin}, web/src/bootstrap
```

```
packages/web ──HTTP + SSE──► packages/server ──imports──► packages/core ──► @cursor/sdk, LangGraph
```

## Follow a run

What happens when someone presses **Start run** in the browser, and where to
read about each hop:

1. `WorkflowPage` calls `useStartRun` → `HttpOrchestratorApi.startRun` →
   `POST /api/workflows/:id/runs`. ([web-app](web-app.md), [http-api](http-api.md))
2. The route calls `RunSupervisor.start`: it loads the workflow, `prepareRun`
   validates it and saves the run (`run.json`) under a new id, and the
   supervisor answers `202 { runId }` while the run moves in the background.
   ([runs-and-events](runs-and-events.md), [workflows](workflows.md))
3. `LangGraphRunEngine.start` compiles the workflow into a graph and invokes
   it with the run id as thread id. ([engine](engine.md))
4. The first node is an agent step: `runAgentStep` builds the message
   ([prompts](prompts.md)), snapshots the files and records a git tree of them, starts the agent through the
   `AgentRuntime` port, saves a run ref, forwards the agent's events, waits,
   snapshots again and records what changed. ([agent-steps](agent-steps.md))
5. Every event goes through the supervisor: numbered, appended to
   `events.jsonl`, handed to SSE listeners. ([runs-and-events](runs-and-events.md))
6. The browser's `useRunEvents` receives them over
   `GET /api/runs/:runId/events`; `stepTimeline` turns state + events into the
   rows the run page shows. ([web-app](web-app.md))
7. The gate node calls `interrupt()`; the run settles as `waiting`. The person
   approves or rejects → `POST …/resume` → `RunSupervisor.resume` → the engine
   resumes the graph with `Command({ resume })`. ([engine](engine.md)) The
   gate panel shows each file's diff against the tree recorded before the
   steps ran. ([gate-changes](gate-changes.md))
8. The run ends `finished`, `failed`, `rejected` or `interrupted`; the last
   event is `run-settled` with that outcome.

The terminal path (`npm run wf`) is the same from step 2 on, without SSE:
it uses the same `RunSupervisor` (so the run is logged, holds the project's
lease, and shows up in the web app) and waits until the run stops moving.
([cli](cli.md))

## Vocabulary

**Host project**: the project being worked on. **Skill**: a `SKILL.md` folder.
**Agent**: a persona file in `.cursor/agents/`. **Artefact**: a file a step
reads or writes. **Workflow**: steps and edges in `.cursor/workflows/<id>.json`.
**Phase**: a named, ordered group of workflows. **Step**: an agent step or a
gate. **Run**: one execution of a workflow (`runId`). **Attempt**: one agent
run of a step; a rejected or retried step gets a new attempt. **Outcome**:
where a run stands (`waiting`, `finished`, `failed`, `rejected`,
`interrupted`).

## Frontmatter

Every doc here starts with:

```yaml
title: …          # what the doc is about
area: …           # the doc's id (its file name without .md); "overview" for this one
summary: …        # one sentence
code: [ … ]       # files or globs this doc describes; every source file is in some doc
depends_on: [ … ] # areas this one relies on
used_by: [ … ]    # areas that rely on this one
adrs: [ … ]       # ADR numbers behind it
specs: [ … ]      # slice specs that built it
updated: …        # last time the doc was checked against the code
```

`tests/docs.test.ts` checks it: every `code` entry matches a file, every
source file is covered, every area named exists.
