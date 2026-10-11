# ADR-0001 — The orchestrator is a folder dropped into the host project

**Status:** Proposed (2026-10-11)

## Context

Teams already keep their Cursor skills, agents and discovery artefacts in
the project repo. The orchestrator has to work on that setup as it is:
copy it in, install, run, and the project's own skills and agents are there.
A separate app pointed at a repo from outside adds a step (which repo? which
branch?) and puts the workflows somewhere the project doesn't version.

## Decision

- The orchestrator is one folder, `workflow-orchestrator/`, placed at the
  host project's root (copied, cloned, or added as a git submodule).
- By default the host root is the folder's parent (`"projectRoot": ".."`).
  `ORCH_PROJECT_ROOT` overrides it.
- Files are split by owner:
  - **Host owns** skills, agents, artefacts and **workflows**
    (`<host>/.cursor/workflows/*.json`). They are the team's process and are
    versioned with the project.
  - **Orchestrator owns** its code, its config, and `.data/` (checkpoints,
    event logs, run refs), which is gitignored.
- The orchestrator never writes into the host outside `.cursor/workflows/` and the
  files an agent step or the file editor changes.
- The Cursor agent runs with `cwd` = host root, so it sees the project the
  way Cursor does.

## Consequences

- The host should ignore the orchestrator folder (or keep it as a submodule)
  so it doesn't commit `node_modules`. The README says so; the orchestrator
  does not edit the host's `.gitignore` itself.
- An agent step can also edit files inside `workflow-orchestrator/`, because
  it is under the host root. The step prompt says not to; a later slice can
  add a `.cursorignore` entry if that turns out to be insufficient.
- Tests and development use `fixtures/sample-project` as the host, never the
  real parent folder.

## Alternatives considered

- **A standalone app that opens any repo.** Better for many projects at
  once, but adds repo selection and keeps workflows outside the project.
  The drop-in folder can still become that later: `projectRoot` is already
  config.
- **An npm package installed into the host (`npx orchestrator`).** Cleanest
  install, but hosts that aren't Node projects would get a `package.json`
  they don't want. Possible once the MVP works.
- **Workflows in `.data/`.** They would not be versioned or reviewed with the
  project, which is the point of having them.
