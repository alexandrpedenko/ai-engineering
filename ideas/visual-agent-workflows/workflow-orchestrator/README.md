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
22.13 or newer (`.nvmrc`) and git (for the diffs at each gate).

**Keep the orchestrator outside the project** when the project may hold
content from people you don't trust: agents are kept away from it
([ADR-0017](../adr/0017-agent-containment.md)), but outside is safer still.

## Scripts

| | |
| --- | --- |
| `npm run dev` | API server (port 4317) and web UI (port 5173), both reloading on change |
| `npm start` | builds the web UI and serves it with the API on one port (4317), no reloading |
| `npm run dev:sample` | `dev` on a copy of the sample project with a fake agent (no key, no cost) |
| `npm run wf -- --help` | run, continue, retry, inspect or delete a run from the terminal |
| `npm run scan -- --project <path>` | list a host project's skills, agents, artefacts and warnings (`--json` for JSON) |
| `npm run smoke` | checks the Cursor SDK and LangGraph load; no API key needed |
| `npm run check` | the gate: typecheck, lint, then all tests |
| `npm run lint` | oxlint |
| `npm run typecheck` | `tsc` over all three packages |
| `npm test` | vitest (node + jsdom projects), including the architecture and guard tests; never calls Cursor |

## Layout

How it works: [docs/architecture/](docs/architecture/README.md). Coding rules (Clean Architecture layers, checked by `npm test`): [AGENTS.md](AGENTS.md).

- `packages/core`: domain, use cases and ports, infrastructure adapters (fs, Cursor, LangGraph)
- `packages/server`: Hono API, runs and checkpoints
- `packages/web`: React + MUI + React Flow UI
- `.data/`: run state; gitignored

## Troubleshooting

- **The server won't start: "Invalid config in …"**: the file and key it names
  are wrong (usually `projectRoot` in `settings.json`).
- **"CURSOR_API_KEY is not set" (or ANTHROPIC_API_KEY)**: put it in
  `workflow-orchestrator/.env`, or use `--fake`. `GET /api/health` says
  whether the key, git and the data folder are fine.
- **"run X is moving; one run moves at a time"**: wait for it, or cancel it.
  "…in another process (pid N)": a `npm run wf` or another server is moving
  it. If that process is gone, the next action takes over its lease.
- **A run shows "the process moving this run stopped before it settled"**:
  the server stopped mid-step. Press Continue (or `npm run wf -- continue <runId>`).
- **No diffs at the gate ("not a git repository")**: the project isn't in a
  git repository, or the repository ignores it (like `.data/sample-project`).
- **Logs**: `.data/logs/server.log` (one JSON object per line); each run's
  events are in `.data/runs/<runId>/events.jsonl`.
- **Clean up**: delete runs you don't need (`npm run wf -- delete <runId>`, or
  Delete run in the web app): that also frees the project states kept for
  their gates (`refs/orchestrator/` in the project's git). Deleting `.data/`
  forgets every run.
