# workflow-orchestrator

Draw workflows from your project's Cursor skills and agents, run them, and get
the results as changed files in the project. Design: [../spec.md](../spec.md),
decisions: [../adr/](../adr/).

## Use it in a project

```bash
cd my-project                      # has .cursor/skills, .cursor/agents, discovery/ …
git clone <this repo> workflow-orchestrator   # or copy the folder
echo "workflow-orchestrator/" >> .gitignore   # or add it as a submodule instead
cd workflow-orchestrator
cp .env.example .env               # set CURSOR_API_KEY
npm install
npm run dev                        # http://localhost:5173
```

Needs Node 22.13 or newer. The parent folder is the project it works on;
`ORCH_PROJECT_ROOT` points it somewhere else. Workflows are saved in the
project's `.cursor/workflows/` folder.

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
