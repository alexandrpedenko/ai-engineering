---
title: Terminal commands
area: cli
summary: npm run scan and npm run wf — the same use cases as the server, driven from a terminal.
code:
  - packages/server/src/cli/**
  - packages/server/src/bin/**
depends_on: [project-registry, runs-and-events, engine, gate-changes]
used_by: []
adrs: [10]
specs: [1-registry, 3-cursor-runtime, 5.5-retry, 8-changes-at-the-gate]
updated: 2026-10-12
---

# Terminal commands

**What it answers:** how do I use the orchestrator without the browser?

| command | does | exit codes |
| --- | --- | --- |
| `npm run scan -- [--project p] [--json]` | prints the registry | 0; 1 bad config; 2 bad arguments |
| `npm run wf -- run <workflowId> [--input k=v]… [--project p] [--fake]` | starts a run, prints events, asks at each gate | 0 finished or stopped at a gate; 1 failed / rejected / invalid; 2 bad arguments; 3 no `CURSOR_API_KEY` |
| `npm run wf -- continue <runId> […]` | an interrupted run re-enters its step; a waiting run asks at its gate | same |
| `npm run wf -- retry <runId> […]` | a failed run's failed step runs again, then asks at gates | same |
| `npm run wf -- status <runId>` | the outcome and each step's attempts (never needs a key) | 0; 1 unknown |

At a gate, `formatGate` lists each file with its change and `+added −removed`
(or why there is no diff), from `gateChanges`; no diff text. Then `y` approves, other text rejects with that text as feedback, an
empty line (or end of input) stops for now. The run id is printed with the
first event, so it's on screen before a Ctrl-C.

**Structure:** `cli/*` are adapters (argument parsing, formatting, the
command logic, all taking their dependencies as arguments, so tests need no
terminal). `bin/*` are the entry points: they wire real services
(`createProjectServices`, `createRunServices` from [composition](composition.md))
and read standard input themselves (lines arriving before a question are
queued, so piped answers work).

## Tests

`server/tests/cli/*.test.ts` with fake services and scripted answers.
