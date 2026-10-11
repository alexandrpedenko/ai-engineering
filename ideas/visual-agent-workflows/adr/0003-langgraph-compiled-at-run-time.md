# ADR-0003 — LangGraph.js is the engine, compiled from the workflow at run time

**Status:** Accepted (2026-10-11)

## Context

Running a workflow needs: a step order, pausing at a gate until a person
answers (possibly after a server restart), looping back on reject, live
progress for the UI, and later parallel branches and sub-workflows. LangGraph.js
(`@langchain/langgraph`) provides checkpointing per `thread_id`,
`interrupt()` / `Command({ resume })`, streaming, subgraphs and `Send`.
Writing all of that ourselves is possible but it isn't the product.

## Decision

- `compile(workflow, deps)` turns a validated workflow into a LangGraph
  `StateGraph` each time a run starts or resumes. Nothing LangGraph-specific
  is saved in the workflow file.
- One graph node per step. Agent step → a node that calls `AgentRuntime`
  (ADR-0004). Gate → a node whose only work is `interrupt()` and routing on
  the decision (ADR-0006).
- `runId` is the LangGraph `thread_id`. The checkpointer is `MemorySaver` in
  tests and SQLite (`@langchain/langgraph-checkpoint-sqlite`) in
  `.data/checkpoints.sqlite` from slice 4.
- LangGraph types stay inside `core/compile` and the server's run manager.
  The schema, the runtime port and the web app don't import LangGraph.

## Consequences

- A run is resumed by compiling the workflow again and calling the graph with
  the same `thread_id`. If the workflow file changed since the run started,
  the run is resumed against a snapshot of the workflow stored with the run
  (`.data/runs/<runId>/workflow.json`), never against the edited file.
- Replacing LangGraph means rewriting `compile` and the run manager; saved
  workflows and the UI don't change.

## Alternatives considered

- **Our own small engine.** A loop over steps plus a persisted cursor covers
  the MVP. It stops being small at parallel branches, durable pauses inside
  nested workflows, and replaying history, which are next on the roadmap.
- **LangGraph Platform / `langgraph dev` server.** Brings its own API and
  deployment; overkill for a tool that runs on one machine next to the repo.
