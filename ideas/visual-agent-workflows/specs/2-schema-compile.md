# Slice 2 — workflow schema and the engine on a fake runtime

**Status:** built (2026-10-11), 2a and 2b together; in review.

**Capability.** A workflow file is read, checked against the project, and
run: each agent step becomes a message to an agent, each gate pauses until a
person approves or rejects, and a rejection sends the work back with the
feedback. All of it on a **fake** agent runtime, so it runs in tests with no
API key and no cost. The real Cursor runtime is slice 3.

```
BA discovery   elicit ──► review ──► refine
                  ▲          │
                  └─reject───┘   (at most maxRevisions times)

start  → elicit runs (fake agent) → review waits        outcome: waiting at "review"
reject "add acceptance checks" → elicit runs again, the message now ends with
         "Reviewer feedback: 1. add acceptance checks" → review waits again
approve → refine runs → end                              outcome: finished
```

Follows [../spec.md](../spec.md) (Contracts → Workflow file, Phases file, Run
state, AgentRuntime port) and ADRs 0002, 0003, 0004, 0005, 0006, 0009, 0010.

**Two halves, reviewed separately.** This slice is too big to read in one
sitting, so it is built in two parts with a stop between:

- **2a — the workflow, checked and turned into a prompt.** Domain only:
  schemas, `validate`, `buildPrompt`, the run-state types. Pure functions,
  pure tests.
- **2b — the engine.** The ports, the agent-step logic, the LangGraph engine,
  `FakeAgentRuntime`, and `startRun` / `resumeRun`.

Each half leaves `npm run check` passing.

## Refinements to spec.md contracts

Found while writing this spec. They're added to spec.md's `## Amendments`
when 2a/2b are built:

1. **`validate` returns `Problem`s with a severity, and the step id is
   optional.** spec.md says "a list of problems, each with a step id", and
   also that an unknown phase is "a warning only". A phase problem belongs to
   the workflow, not a step, and "warning only" needs a severity:
   `type Problem = { severity: "error" | "warning"; stepId?: string; message: string }`.
   A workflow can run when it has no `error`s.
2. **`RunState` gains `decisions` and `stoppedAt`.** The gate's answers have to
   be in state for the edge after the gate to route on them, and "the run
   stopped because a gate hit `maxRevisions`" has to be visible after the run:
   `decisions: Record<gateId, GateDecision[]>` (append) and
   `stoppedAt: string | null` (the gate id).

Neither changes what a later slice does, beyond giving slices 4–5 the
decision history to show.

---

## 2a — the workflow, checked and turned into a prompt

### Adds

```
packages/core/src/domain/
  workflow.ts      Workflow, AgentStep, GateStep, Edge, WorkflowInput schemas + types
  phase.ts         Phase, PhasesFile schemas; DEFAULT_PHASES
  validate.ts      validate(workflow, context) → Problem[]; hasErrors(problems)
  template.ts      fillTemplate(text, inputs); templateRefs(text)
  buildPrompt.ts   buildPrompt(input) → string; resolveModel(step, agent, defaultModel)
  runState.ts      StepRecord, GateDecision (schema), RunState, RunEvent types
```

### `workflow.ts`

The shape from spec.md (Contracts → Workflow file), as zod schemas.

```ts
const StepId = z.string().regex(/^[a-z][a-z0-9-]*$/);   // also the graph node name; can't clash with "__start__"/"__end__"

const AgentStep = z.strictObject({
  id: StepId, type: z.literal("agent"), label: z.string(),
  agent: z.string(), skills: z.array(z.string()).default([]),
  instructions: z.string(),
  reads: z.array(z.string()).default([]), writes: z.array(z.string()).default([]),
  model: z.string().nullable().default(null),
});
const GateStep = z.strictObject({
  id: StepId, type: z.literal("gate"), label: z.string(),
  shows: z.array(z.string()).default([]),
  onReject: StepId, maxRevisions: z.number().int().min(0).default(3),
});
const Step = z.discriminatedUnion("type", [AgentStep, GateStep]);
const Workflow = z.strictObject({
  schema: z.literal(1), id: StepId, name: z.string(), phase: z.string().optional(),
  inputs: z.array(WorkflowInput).default([]),
  steps: z.array(Step).min(1),
  edges: z.array(z.strictObject({ from: StepId, to: StepId })).default([]),
  layout: z.record(z.string(), z.object({ x: z.number(), y: z.number() })).default({}),
});
```

`WorkflowInput = { id, label, type: "text", required: boolean (default false) }`.

### `phase.ts`

`Phase = { id, name, description?, order }`, `PhasesFile = { phases: Phase[] }`,
`DEFAULT_PHASES` = `discovery` (1), `delivery` (2) (ADR-0009). Reading
`phases.json` from disk is slice 4.

### `validate(workflow, context): Problem[]`

`context = { registry: Registry; phases: Phase[] }`. Problems, in this order:

| check | severity | stepId |
| --- | --- | --- |
| two steps with the same id | error | the id |
| agent step: unknown `agent` | error | step |
| agent step: unknown skill (one problem per skill) | error | step |
| agent step: `{{inputs.x}}` with no input `x` | error | step |
| edge from / to a step that doesn't exist | error | — |
| no start step (every step has an incoming edge) | error | — |
| more than one start step | error | each start step |
| a step with more than one outgoing edge (no branching in the MVP) | error | step |
| a cycle through `edges` | error | a step on it |
| a step not reachable from the start | error | step |
| gate `onReject` is not an agent step upstream of the gate | error | gate |
| agent step with no `writes` | warning | step |
| `phase` missing or not in `phases` | warning | — |

Messages are short sentences a person can act on: `unknown skill "req-elicitation"`,
`"review" sends rejections to "refine", which comes after it`.

`hasErrors(problems)` is true when any problem is an error.

### `template.ts`

`fillTemplate("Focus: {{inputs.focus}}", { focus: "pricing" })` → `"Focus: pricing"`.
A declared input with no value fills as `""`. Whitespace inside the braces is
allowed (`{{ inputs.focus }}`). `templateRefs(text)` lists the input ids a
text uses (for `validate`). No other template syntax.

### `buildPrompt(input): string`

```ts
type PromptInput = {
  step: AgentStep;
  agent: AgentDef;
  skills: Skill[];                 // the step's skills, in the step's order
  inputs: Record<string, string>;
  feedback: string[];              // reviewer feedback for this step, oldest first
  doNotTouch: string[];            // e.g. ["workflow-orchestrator/"]
};
```

The message, sections in this order, each left out when empty (ADR-0005):

```
# Your role
<agent body>

# Skills to follow
## <skill name>
<skill body>
…

# Task
<instructions with inputs filled in>

# Read first
- discovery/brief.md

# You must write
- discovery/requirements.md

# Reviewer feedback on your previous attempt
1. <oldest>
2. <newest>

# Rules
- Do not change anything in: workflow-orchestrator/
```

### `resolveModel(step, agent, defaultModel): { id: string }`

`step.model`, else `agent.model` unless it is `"inherit"`, else
`defaultModel`.

### `runState.ts`

`StepRecord` and `RunState` as in spec.md, plus the two refinements above.
`GateDecision` is a zod schema (it arrives from outside on resume):
`{ decision: "approve" } | { decision: "reject"; feedback: string (min 1) }`.

```ts
type RunEvent =                              // what the engine reports while it runs (SSE in slice 4)
  | { type: "step-started"; stepId: string; attempt: number }
  | { type: "agent-event"; stepId: string; event: StepEvent }
  | { type: "step-finished"; stepId: string; record: StepRecord }
  | { type: "gate-waiting"; gateId: string; shows: string[] };
```

`StepEvent` lives in `domain/runState.ts` too (it's data, used by the port in 2b).

### 2a tests

| file | checks |
| --- | --- |
| `domain/workflow.test.ts` | the spec.md example parses; defaults fill in; unknown key, bad step id, unknown step type rejected |
| `domain/phase.test.ts` | a phases file parses; defaults are discovery, delivery |
| `domain/validate.test.ts` | one test per row of the table, each on a small workflow; the spec.md example plus the sample-project registry has no errors |
| `domain/template.test.ts` | fill, missing value → "", whitespace in braces, `templateRefs` |
| `domain/buildPrompt.test.ts` | the full message for one step (exact text); empty sections left out; feedback numbered oldest first; `resolveModel` three cases |
| `domain/runState.test.ts` | `GateDecision` accepts approve / reject-with-feedback, rejects reject without feedback |

### 2a done when

`npm run check` passes. No new dependencies.

---

## 2b — the engine

### Adds

```
packages/core/src/
  application/
    AgentRuntime.ts      the port from spec.md (start, attach) + RunHandle
    RunEngine.ts         the RunEngine port + RunOutcome
    runAgentStep.ts      runAgentStep(deps, step, state) → StepRecord
    startRun.ts          startRun(deps, workflow, inputs) → RunOutcome
    resumeRun.ts         resumeRun(deps, runId, workflow, decision) → RunOutcome
    errors.ts            + InvalidInputError, ConflictError
  infrastructure/
    FakeAgentRuntime.ts  AgentRuntime that replays scripted replies
    LangGraphRunEngine.ts RunEngine on @langchain/langgraph
```

### Ports

```ts
interface AgentRuntime {   // spec.md, unchanged
  start(req: { cwd: string; model: { id: string }; message: string; key: string }): Promise<RunHandle>;
  attach(cursorRunId: string, cwd: string): Promise<RunHandle | null>;
}

type RunOutcome =
  | { status: "waiting"; gateId: string; shows: string[]; state: RunState }
  | { status: "finished"; state: RunState }
  | { status: "failed"; stepId: string; state: RunState }
  | { status: "rejected"; gateId: string; state: RunState };   // a gate hit maxRevisions

interface RunEngine {
  start(runId: string, workflow: Workflow, inputs: Record<string, string>): Promise<RunOutcome>;
  resume(runId: string, workflow: Workflow, decision: GateDecision): Promise<RunOutcome>;
  outcome(runId: string, workflow: Workflow): Promise<RunOutcome | null>;   // null: no such run
}
```

### `runAgentStep(deps, step, state): Promise<StepRecord>`

`deps = { runtime, registry, cwd, defaultModel, doNotTouch, runId, onEvent }`.
The logic of one agent step, with no LangGraph in it:

1. `attempt` = runs of this step so far + 1.
2. Message from `buildPrompt` (agent and skills looked up in the registry;
   feedback from `state.feedback[step.id]`), model from `resolveModel`.
3. `onEvent(step-started)`, `runtime.start({ …, key: "<runId>:<stepId>:<attempt>" })`,
   forward every `StepEvent` as `agent-event`, then `wait()`.
4. Returns a `StepRecord`: `done` on `finished`, `failed` otherwise;
   `cursorRunIds` = the previous ones plus this one; `writes: []` and
   `missing: []` (filled from disk in slice 3, ADR-0007); `onEvent(step-finished)`.

Run refs and reattaching (ADR-0006) are slice 3; here `attach` is never called.

### `LangGraphRunEngine`

`new LangGraphRunEngine({ checkpointer, agentStep })`, where `agentStep` is
`runAgentStep` with its deps bound, and `checkpointer` is any LangGraph
`BaseCheckpointSaver` (`MemorySaver` in tests and for now; SQLite in slice 4).

- Compiles the workflow on each call (ADR-0003). `runId` is the `thread_id`.
- State annotation: `RunState` with reducers: `steps` merge by id, `feedback`
  and `decisions` append per id, `revisions` merge, `stoppedAt` last value.
- Agent step → node calling `agentStep`; then a conditional edge: `failed` →
  END, otherwise the next step (or END).
- Gate → node whose only work is `interrupt({ gateId, shows })`, parsing the
  answer with `GateDecision` and recording it (ADR-0006: nothing before the
  `interrupt`). Then a conditional edge on the last decision:
  - approve → next step (or END)
  - reject, and `revisions[gate] < maxRevisions` → `onReject`, with the
    feedback appended to `feedback[onReject]` and `revisions[gate] + 1`
  - reject at the limit → END with `stoppedAt = gate`
- `RunOutcome` is read from `getState`: a pending interrupt → `waiting`;
  else a failed step → `failed`; else `stoppedAt` → `rejected`; else
  `finished`.
- `resume` on a run that isn't waiting → `ConflictError`.
- Node names are step ids, known only at run time. LangGraph's TypeScript
  types expect them at compile time, so the graph builder is typed as
  `StateGraph<…, string>` through one cast in one function. The prototype
  (2026-10-11, `@langchain/langgraph` 1.4.21) confirmed dynamic nodes,
  `interrupt` + `Command({ resume })`, the reject loop, and resuming from a
  newly compiled graph on the same checkpointer.

### `startRun` / `resumeRun`

`startRun(deps, workflow, inputs)`: `validate` against the registry and
phases; any error → `InvalidInputError` listing the problems; a required
input missing → `InvalidInputError`; otherwise `engine.start` with a new
`runId` from `deps.newId()`. `resumeRun(deps, runId, workflow, decision)`:
parses `decision` with `GateDecision` (bad shape → `InvalidInputError`), then
`engine.resume`. Where the workflow comes from (and its snapshot, ADR-0003)
is slice 4.

### `FakeAgentRuntime`

```ts
new FakeAgentRuntime(replies: FakeReply[] | ((req, callIndex) => FakeReply))
type FakeReply = { events?: StepEvent[]; status?: "finished" | "error"; summary?: string };
```

Replays replies in order (the last one repeats). Records every request in
`requests` so a test can read the message an agent got. `attach` returns `null`.
It's infrastructure, not test support, because slice 4's server can run on it
in a demo mode.

### 2b tests

| file | checks |
| --- | --- |
| `application/runAgentStep.test.ts` | message and model passed to the runtime; events forwarded in order; `finished` → done, `error` → failed; attempt numbering from earlier records; idempotency key |
| `application/startRun.test.ts` | a workflow with an error is refused with its problems; a missing required input is refused; a valid one reaches the engine with a new id (fake engine) |
| `application/resumeRun.test.ts` | a malformed decision is refused; a valid one reaches the engine |
| `infrastructure/FakeAgentRuntime.test.ts` | replies in order, last repeats; requests recorded; `attach` → null |
| `infrastructure/LangGraphRunEngine.test.ts` | on the BA workflow with `FakeAgentRuntime` and `MemorySaver`: start → waiting at review; approve → refine runs → finished; reject → elicit runs again and its second message contains the feedback; `maxRevisions: 1` → the second reject ends `rejected`; a failing agent → `failed`, no later step runs; resume on a finished run → `ConflictError`; **a new engine on the same checkpointer resumes a waiting run** (a server restart); `outcome` of an unknown run → null |
| `application/errors.test.ts` | + the two new errors |

### 2b done when

`npm run check` passes, and the engine test above shows the whole loop with
no API key and no network. No new dependencies (`@langchain/langgraph` is
already installed).

## Not in this slice

- Cursor itself, run refs, output checks (slice 3).
- Reading workflows and `phases.json` from disk, the run's workflow snapshot,
  the SQLite checkpointer, HTTP (slice 4).
- Anything in `web`. No web tests: this slice adds no web code.

## Amendments

**2026-10-11, slice 2 build — the run id is an argument, not a dependency.**
Spec said: `runAgentStep(deps, step, state)` with `runId` in `deps`, and
`new LangGraphRunEngine({ checkpointer, agentStep })`.
Now: `runAgentStep(deps, runId, step, state)`; `deps.onEvent(runId, event)`;
the engine takes `{ checkpointer, agentStep: (runId, step, state) => …, onEvent? }`
and reports `gate-waiting` itself.
Why: one engine and one set of deps serve every run; the run id comes from
the graph's `thread_id` on each call, so it can't be bound in advance.

**2026-10-11, slice 2 build — `startRun` returns the run id too.**
Spec said: `startRun(deps, workflow, inputs) → RunOutcome`.
Now: `→ { runId, outcome }`.
Why: the id is created inside `startRun` (`deps.newId()`), and the caller
needs it to resume the run.

**2026-10-11, slice 2 build — a run stopped inside a step has no outcome yet.**
Spec said: nothing about a run whose process died in the middle of an agent
step.
Now: `outcome()` throws `run "<id>" stopped inside "<step>"` for such a run.
Why: in slice 2 only a crash can cause it. Slice 3 handles it by reattaching
to the Cursor run (ADR-0006) or marking the step failed; its spec will say
which outcome it reports.
