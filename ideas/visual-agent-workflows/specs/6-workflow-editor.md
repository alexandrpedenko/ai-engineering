# Slice 6 — the workflow editor

**Status:** built (2026-10-11), in review.

**Capability.** Draw a workflow in the browser instead of writing JSON:
create one inside a phase, add agent steps and gates from a palette, connect
them, fill in each step from pickers of the project's agents, skills and
phases, see problems on the nodes as you edit, save, and run it. The BA
workflow drawn from scratch runs the same as the hand-written
`ba-discovery.json`.

```
/workflows/ux-flows/edit                                  ● unsaved   [ Save ]
┌ Palette ─────┐┌ Canvas ───────────────────────────────┐┌ Inspector ───────────┐
│ + Agent step ││  ┌──────────────┐     ┌────────────┐   ││ Agent step "flows"   │
│ + Gate       ││  │ Map flows    │────▶│ ◆ Review   │   ││ Label  [Map flows  ] │
│              ││  │ designer     │     │   flows    │   ││ Agent  [designer  ▾] │
│ Workflow     ││  │ user-flows   │◀┄┄┄┄│            │   ││ Skills [user-flows ×]│
│ Name [UX…  ] ││  └──────────────┘ re- └────────────┘   ││ Instructions         │
│ Phase [Disc▾]││              ject                      ││ [Map the user flows…]│
│ Inputs  [+]  ││                                        ││ Next step [review ▾] │
└──────────────┘└────────────────────────────────────────┘│ ▸ Files (optional)   │
 Problems: none                                           └──────────────────────┘
```

Follows [../spec.md](../spec.md), ADRs 0002 (workflows are JSON files),
0009 (phases), 0010 (layers), 0011 (TanStack Query + Zustand), 0012 (tests),
0014 (`writes` and `shows` are optional). Uses React Flow 12, already a
dependency since slice 0.

**One slice, reviewed in this order:** (1) the domain functions and their
tests: workflow ↔ canvas and the edits; (2) the two server routes; (3) the
draft store and hooks; (4) the editor page and the sidebar's "New workflow".

## Screens and routes

| route | page | change |
| --- | --- | --- |
| `/workflows/:id` | `WorkflowPage` | gains an **Edit** button |
| `/workflows/:id/edit` | `WorkflowEditorPage` (new) | palette, canvas, inspector, problems, Save, Delete |
| sidebar | `AppSidebar` | a **New workflow** item under each phase (and under Unsorted) |

**New workflow.** A dialog asks for a name; the id is made from it
(`"UX flows"` → `ux-flows`) and can be changed before creating. It is
refused while an id is taken. The workflow is created on the server at once,
with the chosen phase and one empty agent step, so it shows in the sidebar.
Then the editor opens.

**Palette.** **Add agent step** and **Add gate** buttons. Each new node gets
a free id (`step-1`, `gate-1`, …) and is placed to the right of the
rightmost node. Buttons rather than drag-and-drop, so they're usable from
the keyboard and testable. Below the buttons, the workflow's own fields:
name, phase (a picker from `phases.json`, or none), inputs (add / remove; id,
label, required).

**Canvas** (React Flow).
- Agent nodes show their label, agent and skills. Gate nodes show their
  label, with a different shape.
- Edges are solid arrows. A gate's `onReject` is drawn as a dashed arrow back
  to its target and can't be dragged.
- Dragging from one node's handle to another sets that node's **next step**.
  A step already has at most one next step (the validator's rule), so a new
  connection replaces the old one.
- Moving a node updates `layout`. Selecting a node opens it in the inspector.
  Delete / Backspace removes the selected node or edge.
- A node with problems gets a red (error) or amber (warning) border, and a
  tooltip lists the problems.

**Inspector** for the selected step:

| step | fields |
| --- | --- |
| both | **id** (renaming updates edges, `onReject` references and `layout`; refused while taken or invalid); **label**; **next step** (a picker; the same as connecting on the canvas) |
| agent | **agent** (picker from the registry, with each agent's description); **skills** (multi-picker from the registry); **instructions** (multi-line text; `{{inputs.x}}` allowed); **model** (optional text); **files**, collapsed and marked optional: **reads** and **writes** (free text with suggestions from the registry's artefacts) |
| gate | **sends rejections to** (picker of agent steps before the gate); **max revisions**; **shows**, collapsed and optional: "empty shows what the steps before it changed" (ADR-0014) |

**Problems** come from the server, never computed in the web app (`web`
imports `@orch/core` as types only). While editing, the draft is sent to
`POST /api/workflows/check` at most every 400 ms. The answer drives the node
borders and the problem list under the canvas; problems without a step id
show only in the list.

**Save** sends the draft with `PUT /api/workflows/:id`, like any workflow
file. A workflow with errors saves but can't run, as before. After saving,
the workflow page shows the saved steps. **Delete** asks for confirmation,
calls `DELETE /api/workflows/:id` and goes to `/project`.

**Unsaved changes.** The draft lives in a Zustand store keyed by workflow id,
so leaving the editor and coming back keeps it. The sidebar marks a workflow
with a draft with "●", and **Discard changes** drops the draft. Closing the
tab with a draft asks the browser's "leave site?" question (`beforeunload`).

## Layers

```
web/src/
  domain/
    workflowCanvas.ts   toCanvas(workflow, problems) → { nodes, edges }   (React Flow shapes as plain data)
    workflowEdits.ts    addStep, removeStep, renameStep, connect, disconnect, moveStep,
                        updateStep, updateWorkflow, newWorkflow(name, phase), idFromName(name), freeStepId
                        — each (workflow, …) → workflow; pure, no React
  application/
    OrchestratorApi.ts  + createWorkflow, saveWorkflow, deleteWorkflow, checkWorkflow
    useWorkflowDraftStore.ts   Zustand: drafts by workflow id, selected step id
    mutations.ts        + useCreateWorkflow, useSaveWorkflow, useDeleteWorkflow
                        (invalidate workflows, workflow(id))
    useWorkflowCheck.ts debounced check of the current draft → problems
  api/
    HttpOrchestratorApi.ts  + the four calls
  components/
    WorkflowCanvas.tsx, StepNode.tsx, GateNode.tsx, StepPalette.tsx,
    StepInspector.tsx, WorkflowFields.tsx, NewWorkflowDialog.tsx
  pages/
    WorkflowEditorPage.tsx (new); WorkflowPage (+ Edit); AppLayout (+ New workflow)
```

The draft is a `Workflow`. Every edit is a domain function on it, and the
canvas is drawn from it with `toCanvas`. React Flow's own node state is not
the source of truth: its change events (move, select, connect, remove) are
turned into edits.

## Server

| method | path | does |
| --- | --- | --- |
| POST | `/api/workflows` | create from a body `{ workflow }` → 201 `{ problems }`; **409** if the id exists (a new `createWorkflow` use case; `saveWorkflow` keeps overwriting) |
| POST | `/api/workflows/check` | `{ workflow }` → `{ problems }` without saving. A body that isn't a workflow gives its parse errors as problems (200), so a half-filled draft still gets answers |

Both are additions to the Server API in [../spec.md](../spec.md) and go into
its Amendments when built. No other server or core changes.

## Tests

| file | checks |
| --- | --- |
| `web/tests/domain/workflowEdits.test.ts` | add places the node right of the others with a free id; remove drops its edges and clears an `onReject` pointing at it; rename updates edges, `onReject`, `layout`, and refuses a taken id; connect replaces an existing next step; `idFromName` (`"UX flows"` → `ux-flows`, accents and symbols dropped, leading digits fixed); **the BA workflow built from `newWorkflow` by edits alone equals `ba-discovery.json`, ignoring `layout`** |
| `web/tests/domain/workflowCanvas.test.ts` | nodes per step with their position; next-step edges solid, `onReject` dashed; problem severity on the right node; a step without a layout entry gets a default position |
| `web/tests/application/useWorkflowDraftStore.test.ts` | a draft per id; discard; selection |
| `web/tests/application/mutations.test.tsx`, `useWorkflowCheck.test.tsx` | create / save / delete invalidate the workflow list and the workflow; the check waits 400 ms and sends only the latest draft |
| `web/tests/api/HttpOrchestratorApi.test.ts` | the four calls: URL, method, body; 409 → `ApiError` |
| `web/tests/pages/WorkflowEditorPage.test.tsx` | the BA workflow's three nodes and its dashed reject edge; add a gate from the palette, pick its reject target, save → `saveWorkflow` gets the new step; pick an agent and skills from the pickers; renaming a step id updates the next-step picker of the step before it; check problems show on the node and in the list; discard; delete asks first |
| `web/tests/pages/AppLayout.test.tsx` | New workflow under a phase → dialog → created in that phase → editor opens; a taken id is refused; a draft marks the workflow with "●" |
| `web/tests/pages/WorkflowPage.test.tsx` | Edit goes to the editor |
| `server/tests/routes/workflowRoutes.test.ts` | create → 201 and the file exists; create again → 409; check returns problems and writes nothing; check with a broken body → parse problems, 200 |
| `core/tests/application/createWorkflow.test.ts` | creates; refuses an existing id; returns problems |

React Flow in jsdom: `setup.ts` already stubs `ResizeObserver`. Page tests
check what's on screen and use the palette, inspector and pickers, not mouse
drags. Dragging to connect is covered by the domain `connect` test.

## Done when

- `npm run check` passes.
- With `npm run dev:sample`, in the browser only:
  1. New workflow "BA discovery 2" in Discovery.
  2. Draw elicit → review → design with the same agents, skills,
     instructions, reads and writes as `ba-discovery.json`, and the gate
     sending rejections to elicit.
  3. Save. The saved file equals `ba-discovery.json` apart from `id`, `name`
     and `layout`.
  4. Run it: it stops at the gate, a reject re-runs elicit, and an approve
     runs design. The same as the hand-written one.
- An unknown agent typed into a draft shows a red node before saving.

## Not in this slice

- Editing skill, agent or artefact files (slice 7, Monaco).
- Editing `phases.json` from the UI (adding, renaming or ordering phases).
- Undo / redo, copy / paste of steps, auto-layout.
- Templates, or duplicating a workflow.
- Parallel branches or routers (post-MVP); the editor allows one next step per step.

## Amendments

**2026-10-11, slice 6 build — removing a step leaves a gate's onReject alone.**
Spec said: "remove drops its edges and clears an `onReject` pointing at it".
Now: `removeStep` drops the step, its edges and its position; a gate that
sent rejections to it keeps the missing id, and the validator reports "sends
rejections to … which doesn't exist". The inspector marks the field in red.
Why: `onReject` is a required step id in the workflow schema, so there is no
empty value to clear it to, and picking another target silently would hide
the change.

**2026-10-11, slice 6 build — a new gate's reject target.**
Spec said: nothing about a new gate's `onReject`.
Now: a new gate sends rejections to the last agent step in the file, or to
itself when there is none (which the validator reports).
Why: the field is required; the last agent step is the usual choice.

**2026-10-11, slice 6 build — more pure functions and two small components.**
Spec said (Layers): `workflowEdits.ts` and `workflowCanvas.ts` in the domain;
the components listed.
Now: also `domain/workflowGraph.ts` (`findStep`, `nextStep`,
`agentStepsBefore`, `stepIdProblem`: questions, kept apart from edits);
`workflowEdits` also has `addInput` / `updateInput` / `removeInput` and
`workflowIdProblem`; `application/useWorkflowDraft.ts` wraps the draft store
for pages; components `NodeFrame` (shared by agent and gate nodes) and
`ConfirmDialog`. `useSaveWorkflow()` takes the workflow when called, not an
id. The web `tsconfig.json` gains `resolveJsonModule`, so the domain test
reads `ba-discovery.json` itself.
Why: one job per file; no logic inside components.

**2026-10-11, slice 6 build — the reject edge is tested in the domain, not the page.**
Spec said: the editor page test checks "its dashed reject edge".
Now: `workflowCanvas.test.ts` checks the reject edge; the page tests check the
nodes, the inspector and what is saved. Page tests select a node with a
plain click event.
Why: React Flow draws edges only after measuring nodes, which jsdom can't do;
and its drag handler fails on jsdom's mousedown events.

**2026-10-11, slice 6 review — differences from the spec text found in review.**
Spec said / now:
- Layers: `updateStep` → built as `updateAgentStep` and `updateGate` (typed
  per step kind). `newWorkflow(name, phase)` → `newWorkflow({ id, name,
  phase })` (the id comes from the dialog).
- Problems: "sent … at most every 400 ms" → sent once the draft has **stopped
  changing** for 400 ms (a debounce, not a throttle).
- Mutations: delete "invalidates workflows, workflow(id)" → delete
  **removes** `workflow(id)` from the cache and invalidates the list (a
  refetch of a deleted workflow would only give a 404).
- Sidebar: "New workflow" under Unsorted only appears when Unsorted exists,
  which is when some workflow has no known phase.
- Server: "no other server or core changes" → core also gained
  `parseWorkflow` (shared by save, create and check), and `POST
  /api/workflows` answers 400 for a body that isn't a workflow.
- Done when 3: the saved file equals `ba-discovery.json` **after parsing**;
  the saved file writes defaults out (`"model": null`, `"required": false`).
- Done when 5: the agent field is a picker, so "an unknown agent typed into a
  draft" can't happen; the check is "a step with no agent chosen shows a red
  node before saving".
Why: the spec's wording didn't match what was built or what can be tested;
recorded here instead of changing the body.

**2026-10-11, slice 6 review — fixes from the four review passes.**
Spec said: see the body and the amendments above.
Now:
- `WorkflowStore` gains `create` (writes with the `wx` flag; `ConflictError`
  for any existing file); `createWorkflow` uses it instead of listing every
  file first, so two creates can't both succeed.
- The server answers only local, JSON requests (ADR-0015, proposed).
- Saving drops the draft only if it wasn't edited while the save was on its
  way (`markSaved`); delete forgets the draft and selection; a failed delete,
  a failed check and a failed reload are shown; the editor is mounted per
  workflow id, so a save error doesn't follow you to another workflow.
- The canvas saves every dragged node, keeps dragged nodes in place when a
  check answer arrives, and gives each edge its own id. New steps go right of
  every drawn node, including ones without a saved position (`positionOf`).
- Nodes are named groups with a "has errors" / "has warnings" dot (was a
  `data-severity` attribute only tests could see). The reject-target field no
  longer checks the validator's rule itself; the server's check reports it.
- Inspector: the id field ignores added spaces; the model field keeps spaces
  while typing; max revisions can be cleared and retyped.
- `workflowIdProblem` moved to `workflowGraph` with `stepIdProblem`.
- `EditorToolbar` component; `useDraftIds` hook for the sidebar.
Why: correctness, security, architecture and style review of the staged
slice; each item is a finding that was confirmed in the code.

**2026-10-11, after slice 7 — steps listed in run order, not file order.**
Spec said: nothing about the order steps are listed in; the editor appends
each new step to the end of `steps`.
Now: the workflow page's step list, the run timeline and the editor's
next-step picker list steps with `stepsInRunOrder` (from the start step along
the edges; unreached steps after, in file order). The file's `steps` order is
unchanged and still doesn't affect a run.
Why: a workflow drawn as BA → Design → Architect → Gate, with Design added
last, was listed (and numbered) BA, Architect, Gate, Design, so the run view
seemed to jump from BA to the last step. The engine always ran it in edge
order; only the lists were wrong.

