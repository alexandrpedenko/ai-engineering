# ADR-0009 — Workflows are grouped into phases the host project defines

**Status:** Accepted (2026-10-11)

## Context

A team doesn't have one workflow; it has several per stage of its process:
two or three discovery workflows (BA, Architect, Designer), a wiki workflow,
delivery workflows. Shown as one flat list, or as one big canvas, they're hard
to find and the order of the process is lost. Each company names and orders
its stages differently, so the orchestrator can't hard-code them.

## Decision

- A **phase** is a named group of workflows: `{ id, name, description?, order }`.
- Phases are defined by the host in `<host>/.cursor/workflows/phases.json`:

  ```json
  { "phases": [
    { "id": "discovery", "name": "Discovery", "order": 1 },
    { "id": "knowledge", "name": "Knowledge base", "order": 2 },
    { "id": "delivery",  "name": "Delivery", "order": 3 }
  ] }
  ```

- Each workflow file has a `"phase": "<phase id>"` field. Workflow files stay
  flat in `.cursor/workflows/`; the phase is data, not a folder.
- If `phases.json` is missing, the defaults are `discovery` and `delivery`.
  A workflow whose `phase` is missing or unknown is shown under **Unsorted**
  and reported by `validate` as a warning, not an error (it can still run).
- The UI is organised by phase: a sidebar lists the phases in `order`, each
  expanding to its workflows. The canvas shows **one workflow at a time**,
  opened from that list. Runs are listed per workflow and across a phase.

## Consequences

- Moving a workflow to another phase is a one-field change, not a file move,
  so its git history stays in one place.
- Renaming a phase's `name` touches only `phases.json`; changing its `id`
  means updating the workflows that use it (the editor does this in one save).
- Phases are only grouping in the MVP. "Delivery may start only after
  discovery's workflows have finished" (phase gates) is post-MVP and would
  build on this file.

## Alternatives considered

- **A folder per phase** (`.cursor/workflows/discovery/ba.json`). Needs no
  extra file, but labels and order still need metadata somewhere, and
  re-phasing a workflow moves the file.
- **Phases in `orchestrator.config.json`.** That file belongs to the tool,
  not the team; the team's process should live with the project (ADR-0001).
- **Free-form tags.** More flexible, but loses the order of the process,
  which is what the sidebar is for.
