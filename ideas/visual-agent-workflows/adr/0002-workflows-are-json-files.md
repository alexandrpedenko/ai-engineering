# ADR-0002 — Workflows are JSON files in our own schema

**Status:** Proposed (2026-10-11)

## Context

A workflow is drawn on a canvas, but it has to live as a file the team can
read, diff and review in a pull request. Something has to be the source of
truth: the canvas state, LangGraph code, or a data file.

## Decision

- A workflow is `<host>/.cursor/workflows/<id>.json`, validated by a zod schema in
  `packages/core/schema`, with a `"schema": 1` version field.
- The file holds what the workflow means (steps, edges, inputs) and, apart
  from it, `layout` (node positions). Layout never changes behaviour.
- References to skills and agents are by name (`"agent": "business-analyst"`),
  not by path, so moving a file within the skill folders doesn't break a
  workflow.
- A workflow with validation problems can be saved but not run.

## Consequences

- The canvas is an editor of this file, nothing more. Hand-editing the JSON
  is supported and shows up on the canvas.
- A schema change bumps `schema` and adds a migration in `core`; old files
  keep loading.
- JSON has no comments. Step `label` and `instructions` carry the human text.

## Alternatives considered

- **YAML.** Nicer by hand, but the canvas rewrites the whole file on every
  save and loses comments and formatting anyway. Can be added as a second
  format later.
- **LangGraph code generated from the canvas.** Unreadable diffs, and ties
  saved workflows to one engine (see ADR-0003).
- **React Flow's own JSON.** Mixes UI state (selection, viewport, handles)
  into the team's process file.
