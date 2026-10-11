---
title: Workflows and phases
area: workflows
summary: The workflow and phase files, what makes a workflow valid, and how they're read and saved.
code:
  - packages/core/src/domain/workflow.ts
  - packages/core/src/domain/phase.ts
  - packages/core/src/domain/validate.ts
  - packages/core/src/domain/template.ts
  - packages/core/src/application/WorkflowStore.ts
  - packages/core/src/application/listWorkflows.ts
  - packages/core/src/application/readWorkflow.ts
  - packages/core/src/application/saveWorkflow.ts
  - packages/core/src/application/savePhases.ts
  - packages/core/src/infrastructure/FsWorkflowStore.ts
depends_on: [project-registry]
used_by: [prompts, engine, runs-and-events, http-api, web-app]
adrs: [2, 9]
specs: [2-schema-compile, 3-cursor-runtime, 4-server]
updated: 2026-10-11
---

# Workflows and phases

**What it answers:** what is a workflow, when can it run, and where does it live?

## Files

In the host project (owned by the project, versioned with it; ADR-0001/0002):

- `.cursor/workflows/<id>.json`: one workflow (`Workflow` zod schema,
  `"schema": 1`).
- `.cursor/workflows/phases.json`: `{ phases: [{ id, name, description?, order }] }`.
  Missing → `DEFAULT_PHASES` (discovery, delivery). ADR-0009.

## A workflow

```
inputs   [{ id, label, type: "text", required }]       filled in when a run starts
steps    agent: { id, label, agent, skills, instructions, reads, writes, model }
         gate:  { id, label, shows, onReject, maxRevisions (default 3) }
edges    [{ from, to }]                                  the order; one line, no branching yet
phase    a phase id (optional)
layout   { [stepId]: { x, y } }                         canvas positions; never affects behaviour
```

Step ids are lowercase-dash names; they're also the graph's node names.
`{{inputs.x}}` in `instructions` is replaced by input `x` (`fillTemplate`).

## Validation

`validate(workflow, { registry, phases })` → `Problem[]`
(`{ severity, stepId?, message }`). **Errors** stop a run; **warnings** don't.

Errors: duplicate step ids; unknown agent or skill; `{{inputs.x}}` with no
input `x`; an edge to a missing step; not exactly one start step; a step with
two next steps; a loop of edges (loops only go through a gate's `onReject`);
a step not reachable from the start; a gate whose `onReject` isn't an agent
step before it. Warnings: no phase or an unknown phase (shown under
Unsorted). An agent step with no `writes` is fine: it writes where its skills
say, and the gate after it shows what changed (ADR-0014).

A workflow with errors **can be saved** but not run (ADR-0002).

## Reading and saving

`WorkflowStore` (port) / `FsWorkflowStore` (adapter): `get`, `list` (a broken
file is listed with its error), `save` (pretty JSON, 2 spaces, final newline),
`remove`, `phases`, `savePhases`. Use cases: `listWorkflows` and
`readWorkflow` (with problems), `saveWorkflow` (body must parse and its id
must match the URL), `savePhases` (ids unique).

A run never reads the workflow file again after it starts: it keeps a copy
(see [runs-and-events](runs-and-events.md)).

## Where to change what

- A new step type or field → `workflow.ts` (+ `validate.ts`, the engine, the UI).
- A new rule → `validate.ts` with a test per rule.

## Tests

`core/tests/domain/{workflow,phase,validate,template}.test.ts`,
`core/tests/application/{listWorkflows,readWorkflow,saveWorkflow,savePhases}.test.ts`,
`core/tests/infrastructure/FsWorkflowStore.test.ts`.
