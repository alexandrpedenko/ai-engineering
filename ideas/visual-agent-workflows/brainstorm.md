# Visual agent workflows — brainstorm

**Status:** idea / brainstorm (2026-10-11). Nothing built. Not part of the bootcamp books.

## The idea in one paragraph

A project folder already holds the parts of an AI-assisted delivery process:
skills (`SKILL.md`), agent definitions (`agents/*.md`), discovery artefacts,
a wiki / knowledge base, delivery outputs. Every company puts these together
differently. The tool loads a project folder, turns its skills and agents into
**managed, editable building blocks**, and lets a team **draw workflows** from
them on a canvas: "BA discovery", "Architect discovery", "Designer discovery",
"Delivery". Each workflow says which agent runs at which step, with which
skills, what it reads, what it must produce, and where a human signs off.
Workflows run on coding agents (Cursor SDK first) and are orchestrated by a
graph engine (LangGraph.js).

## Building blocks

| Block | Source on disk | Role in a workflow |
|---|---|---|
| Skill | `.cursor/skills/<name>/SKILL.md` (or `.agents/skills/`) | Procedure/know-how attached to a step |
| Agent (persona) | `.cursor/agents/<name>.md` | Who does the step: prompt, model, tools |
| Artefact | `discovery/`, `wiki/`, `delivery/` files | Inputs a step reads, outputs it must write |
| Workflow | `.workflows/<name>.json` (ours) | The graph: steps, edges, gates |
| Run | DB (checkpoints + event log) | One execution of a workflow |

Everything except runs is a **plain file in the repo**, so it can be
versioned, code-reviewed and diffed like code.

## Node types (first draft)

- **Agent step** — one coding-agent run. Config: agent persona, allowed skills,
  allowed subagents, model, prompt template, input artefacts, expected output
  artefacts, runtime (local / cloud).
- **Human gate** — pause; show the produced artefacts; approve / reject with
  feedback / edit. Reject loops back to the previous step with the feedback.
- **Router** — choose the next branch by a condition on state (or a cheap LLM
  classification).
- **Parallel / Join** — fan out (e.g. BA + Designer at the same time), wait for both.
- **Sub-workflow** — call another workflow as one node (e.g. "Discovery" contains
  BA → Architect → Designer).
- **Artefact check** — deterministic check: file exists, has required sections,
  passes a lint/schema. No LLM.

## Architecture

```
React + MUI + React Flow (canvas)      ← edit workflows, skills, agents; watch runs
        │  REST + SSE/WebSocket
Node/TS backend
  ├─ Workspace loader     scans project folder → registry of skills/agents/artefacts
  ├─ Workflow store       .workflows/*.json  (our own schema, zod-validated)
  ├─ Compiler             workflow JSON → LangGraph.js StateGraph
  ├─ Engine               LangGraph.js (checkpointer, interrupt/resume, streaming)
  └─ AgentRuntime port    interface; adapters: CursorSdkRuntime, (later) ClaudeAgentSdkRuntime
        │
Coding agent (Cursor SDK: local cwd or cloud VM)  → writes artefacts into the repo
```

- The Cursor SDK runs in Node only and needs the API key → the backend has to be a
  server, not just the browser.
- Canvas: **React Flow (@xyflow/react)** is the standard for node editors; MUI
  for panels, forms, inspector, dialogs. Monaco for editing SKILL.md / agent
  `.md` "like a file in Cursor".

## Key assumptions (to verify before building)

1. **Cursor SDK is TS-only and in public beta** (`@cursor/sdk`, released
   2026-04-29). `Agent.create({ model, local: { cwd, settingSources }, cloud,
   agents, mcpServers })`, `agent.send()`, `run.stream()`, `run.wait()`,
   `Agent.getRun()` for resuming cloud runs. Expect API churn.
2. **Skills are loaded per project, not per step.** With
   `settingSources: ["project"]` the agent sees *all* project skills and picks
   the relevant ones itself. To limit a step to "these 3 skills" we must either
   (a) inline the skill text into the step prompt, or (b) materialise a
   temporary workspace / worktree with only those skills. Start with (a).
3. **Subagents are chosen by the parent agent, not by us.** We can declare which
   subagents exist (`agents` option or `.cursor/agents/`), but the model decides
   when to spawn them. Anything that must happen deterministically is a
   **separate graph node**, not "a subagent we hope gets called".
4. **The graph is the deterministic layer, the agent is the flexible layer.**
   Order, gates, retries, parallelism → graph. How to write a good BRD → agent + skill.
5. **LangGraph.js covers the engine** (`@langchain/langgraph`): StateGraph,
   checkpointer + `thread_id`, `interrupt()` / `Command` resume, streaming,
   subgraphs, parallel branches. Known gotcha: on resume a node **re-runs from
   its start**, so an agent call must never sit before an `interrupt()` in the
   same node. Human gates are their own nodes.
6. **Our workflow JSON is the source of truth, not LangGraph code.** LangGraph is
   compiled from it at runtime. That keeps the engine swappable and makes the
   file diffable and reviewable.
7. **Long agent runs vs the graph:** a node stores the Cursor `run.id` in state
   before waiting, so a restarted server can reattach (cloud) instead of
   re-running.
8. **Parallel branches + local runtime = file conflicts.** Parallel steps need
   separate git worktrees (local) or cloud agents (one run per agent at a time).

## LangGraph vs our own engine

| | LangGraph.js | Own engine |
|---|---|---|
| Linear flow + human gates | ✓ | easy (~a few hundred lines) |
| Durable pause/resume across restarts | ✓ checkpointers | have to build |
| Parallel fan-out / join, loops | ✓ | medium effort |
| Streaming per-node events to UI | ✓ | have to build |
| Time travel / re-run from a checkpoint | ✓ | hard |
| Control over semantics, lighter deps | — | ✓ |

**Leaning:** LangGraph.js as the engine, our own JSON schema on top. Write the
compiler so the engine sits behind one interface. If LangGraph turns out to be
in the way, a small engine for DAG + gates can replace it later without changing
any saved workflow.

## Prior art to look at (and how this differs)

- **Flowise, Langflow, n8n** — visual LLM/automation builders. Generic chains/tools.
- **LangGraph Studio** — visualises and debugs graphs written in code; not an editor.
- **Differentiator here:** repo-native (skills/agents/workflows are files in the
  project), coding agents as the unit of work, and SDLC phases (discovery →
  wiki → delivery) with artefacts and human sign-off as first-class concepts.

## Risks

- Cursor SDK is beta and a single vendor → keep the `AgentRuntime` port; the
  Claude Agent SDK has the same concepts (skills, subagents, hooks, MCP) and is
  a natural second adapter.
- Cost and duration: one workflow = many agent runs. Show cost per step and
  per run from day one.
- "Visual" can grow into a full low-code platform. Keep node types few.
- Artefact quality is the real product; the canvas only orders the steps.

## MVP slice idea

1. Workspace loader: list skills + agents of a folder; edit them in Monaco.
2. One hard-coded workflow (BA discovery: agent step → human gate → agent step)
   compiled to LangGraph.js, run against Cursor SDK local, events streamed to UI.
3. React Flow canvas that reads/writes `.workflows/*.json` for that workflow.
4. Then: router, parallel, sub-workflow, cloud runtime, second agent runtime.

## Open questions

- Per-step skill scoping: inline vs worktree — measure which gives better results.
- Does Cursor SDK expose skill/subagent usage in the event stream (`task` events?)
  so the UI can show "BA agent used skill X, spawned subagent Y"?
- Where runs live: SQLite locally vs Postgres for teams.
- Is a workflow per company, per project, or both (templates + overrides)?
- Desktop app (Electron, direct disk access) vs web app + local agent?

## Parked: placing the orchestrator in a project (2026-10-11)

Today it's a folder copied into the project (ADR-0001), or pointed at a
project with `--project`. The host project needs no npm files; only
`.cursor/workflows/` appears in it. Two ways to make placing it easy, both
parked until after the UI exists:

- **`npm run install-into -- <path>`**: copies only what's needed, adds the
  `.gitignore` line, runs `npm install`, creates `phases.json`, runs `scan`.
  Small; keeps ADR-0001. Doesn't stop a JS/TS host's own tooling (tsconfig,
  ESLint, tests, workspaces) from picking up the copied folder.
- **An npm package run with `npx`**: nothing copied into the project. Needs
  a build (bundle core + server, web built to static files served by the
  server) and a place to publish. Would supersede ADR-0001 with a new ADR.

## Sources

- Cursor SDK overview: https://www.datacamp.com/tutorial/cursor-sdk
- Cursor SDK launch notes: https://www.buildfastwithai.com/blogs/cursor-sdk-coding-agents-typescript-2026
- Cursor skills docs: https://cursor.com/docs/skills
- Official SDK reference (to read first): https://cursor.com/docs/api/sdk/typescript
- LangGraph.js interrupts: https://docs.langchain.com/oss/javascript/langgraph/interrupts
- LangGraph.js persistence: https://docs.langchain.com/oss/javascript/langgraph/persistence
