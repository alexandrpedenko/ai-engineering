# ADR-0006 — Resuming a run never starts a second Cursor run for the same attempt

**Status:** Proposed (2026-10-11)

## Context

LangGraph saves state after a node finishes. If the server stops while an
agent step is running, the run resumes by running that node again from its
first line, which would send the same work to Cursor a second time: double
cost, and two agents editing the same files. The same rule makes a gate
node re-run on resume (the trip planner's ADR-0004 problem).

## Decision

- Before waiting on a Cursor run, the agent node writes a **run ref**
  `.data/runs/<runId>/<stepId>-<attempt>.json` with the Cursor run id.
- When the node starts it looks for the ref of its current attempt. If one
  exists it calls `AgentRuntime.attach()`: a finished run gives its result
  without a new send; a running one is waited on. Only if there is no ref
  (or attach returns `null`) does it start a new run.
- `send()` also gets `idempotencyKey = <runId>:<stepId>:<attempt>`.
- Gate nodes contain nothing but `interrupt()` and the routing on its answer.
  A rejection increments the attempt of the step it sends back to.

## Consequences

- "Kill the process mid-step, restart, no second run" is the done-check of
  slice 3 and is tested with `FakeRuntime`.
- Attempts are numbered, so every Cursor run of a step stays visible in the
  run view.
- Local runs live inside the orchestrator's Node process. If the process dies,
  the Cursor run may die with it; `attach` then reports it as failed and the
  step is marked `failed` with a retry button, not silently re-sent.

## Alternatives considered

- **Rely on `idempotencyKey` alone.** Its semantics for local runs aren't
  documented well enough to bet the guarantee on it.
- **Store the run id in graph state.** State isn't saved until the node
  returns, which is exactly the window that matters.
