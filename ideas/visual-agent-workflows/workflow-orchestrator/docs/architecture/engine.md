---
title: Run engine
area: engine
summary: How a workflow is compiled into a LangGraph graph; agent steps, gates, outcomes, and continuing an interrupted run.
code:
  - packages/core/src/application/RunEngine.ts
  - packages/core/src/domain/runState.ts
  - packages/core/src/infrastructure/LangGraphRunEngine.ts
depends_on: [workflows, agent-steps]
used_by: [runs-and-events, cli, composition]
adrs: [3, 6]
specs: [2-schema-compile, 3-cursor-runtime, 5.5-retry]
updated: 2026-10-11
---

# Run engine

**What it answers:** in what order do steps run, how does a gate pause, and
where does a run stand?

## Port

```ts
interface RunEngine {
  start(runId, workflow, inputs): Promise<RunOutcome>     // runs until it stops moving
  resume(runId, workflow, decision): Promise<RunOutcome>  // a gate's answer
  continue(runId, workflow): Promise<RunOutcome>          // re-enter an interrupted step
  retry(runId, workflow): Promise<RunOutcome>             // run a failed step again
  outcome(runId, workflow): Promise<RunOutcome | null>    // null: no such run
}
RunOutcome = waiting { gateId, shows } | finished | failed { stepId }
           | rejected { gateId } | interrupted { stepId }        (each with `state`)
```

## LangGraphRunEngine

The workflow is **compiled into a graph on every call** (ADR-0003); nothing
LangGraph-specific is saved in workflow files. The run id is LangGraph's
`thread_id`; the checkpointer keeps state between calls and restarts.

- **State** (`RunState`): `workflowId`, `inputs`, `steps` (latest
  `StepRecord` per step), `feedback` (per agent step, appended), `decisions`
  (per gate, appended), `revisions` (per gate), `stoppedAt`.
- **Agent step** → a node that calls `agentStep(runId, step, state)`
  ([agent-steps](agent-steps.md)) and stores the record. Edge after it:
  `failed` → end; else the next step.
- **Gate** → a node whose **only** work is `interrupt({ gateId, shows })`,
  then recording the parsed `GateDecision` (ADR-0006: nothing before the
  interrupt, because the node re-runs from its first line on resume). Edge
  after it: approve → next step; reject → `onReject` with the feedback
  appended for that step and `revisions + 1`; reject when `revisions` already
  equals `maxRevisions` → end with `stoppedAt = gate`.
- **Outcome** is read from LangGraph's state, in this order: a pending
  interrupt → `waiting`; a pending node with no interrupt (the process stopped
  inside it) → `interrupted`; a failed step → `failed`; `stoppedAt` →
  `rejected`; else `finished`. `interrupted` comes before `failed` because a
  retried step keeps its failed record until the new attempt finishes.
- `continue` re-invokes the graph from its checkpoint; the interrupted step
  runs again and **reattaches** to its agent run instead of starting another
  ([agent-steps](agent-steps.md)).
- `retry` (only for `failed`) invokes the graph with
  `Command({ goto: failedStepId })`: the step runs again as the next attempt
  (its own run ref, idempotency key and file check) and the run follows the
  edges from there. Inputs and reviewer feedback are unchanged.
- Wrong state → `ConflictError` (resume a run that isn't waiting, continue one
  that isn't interrupted, retry one that isn't failed, start an id that exists).
- Node names are run-time step ids, so the builder is typed
  `StateGraph<…, string>` through one cast in `compile`.

The engine reports `gate-waiting` itself; agent-step events come from
`runAgentStep`.

## Where to change what

- A new step type → a node + edge in `compile`, its state keys, and how
  `read` derives the outcome.
- Gate behaviour → `gateNode` and the gate's conditional edge.

## Tests

`core/tests/infrastructure/LangGraphRunEngine.test.ts`: the BA workflow on
`FakeAgentRuntime` + `MemorySaver`: wait, approve, reject with feedback,
revisions running out, failure, live events, a restart (new engine, same
checkpointer), interrupted → continue with one agent run in total.
