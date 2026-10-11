# workflow-orchestrator

Draw workflows from your project's Cursor skills and agents, run them, and get
the results as changed files in the project. Design: [../spec.md](../spec.md),
decisions: [../adr/](../adr/).

## Set up

```bash
cd workflow-orchestrator
npm install
cp settings.example.json settings.json   # then edit: your project's path and the agent
cp .env.example .env                     # then add CURSOR_API_KEY and/or ANTHROPIC_API_KEY
npm run dev                              # http://localhost:5173
```

`settings.json` (not committed) says which project to work on and which
agent runs the steps:

```json
{ "projectRoot": "/Users/me/code/booking-app", "runtime": "claude" }
```

- `runtime`: `cursor` (needs `CURSOR_API_KEY`, a paid Cursor plan) or `claude`
  (needs `ANTHROPIC_API_KEY`). Optional `models` sets the default model per runtime.
- Without `settings.json` the project is the folder that contains
  `workflow-orchestrator/` and the agent is Cursor.
- `--project <path>`, `ORCH_PROJECT_ROOT` and `ORCH_RUNTIME` still override
  it for a single command.
- The server and `npm run wf` print which project and agent they use, and why.

Workflows are saved in the project's `.cursor/workflows/` folder. Needs Node
22.13 or newer.

## Scripts

| | |
| --- | --- |
| `npm run dev` | API server (port 4317) and web UI (port 5173) |
| `npm run scan -- --project <path>` | list a host project's skills, agents, artefacts and warnings (`--json` for JSON) |
| `npm run smoke` | checks the Cursor SDK and LangGraph load; no API key needed |
| `npm run check` | the gate: typecheck, then all tests |
| `npm run typecheck` | `tsc` over all three packages |
| `npm test` | vitest (node + jsdom projects), including the architecture and guard tests; never calls Cursor |

## Layout

How it works: [docs/architecture/](docs/architecture/README.md). Coding rules (Clean Architecture layers, checked by `npm test`): [AGENTS.md](AGENTS.md).

- `packages/core`: domain, use cases and ports, infrastructure adapters (fs, Cursor, LangGraph)
- `packages/server`: Hono API, runs and checkpoints
- `packages/web`: React + MUI + React Flow UI
- `.data/`: run state; gitignored
