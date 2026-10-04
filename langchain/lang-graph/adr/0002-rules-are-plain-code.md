# ADR-0002 — The trip's rules are plain code

**Status:** Accepted (2026-10-04)

## Context

Whether a plan is valid is arithmetic and comparison: the nights add up, the
total is within budget, no leg departs before the stated time, every city
in the brief has a stay. A model asked to check these gets them right most
of the time, and the planner's promise is that it gets them right every
time. The same checks are also what the evals score (book 12).

## Decision

`tripgraph/domain/` holds every rule as a pure function — `missing_fields`,
`split_nights`, `check_budget`, `violations`. Nodes call them. A model
reads text and makes choices (which hotel, which activities, how to word the
plan); it never computes a total, decides whether the budget is met, or
validates a brief. `domain/` imports nothing from the rest of `tripgraph`.

## Consequences

- The rules are unit-tested without a model or a graph (`tests/domain/`).
- Book 12's code evaluators are these functions, so the evals and the
  planner can't disagree on what "within budget" means.
- Plain-code nodes and model nodes are both just nodes; the graph diagram
  marks which is which.

## Alternatives considered

- **Ask the model to check the budget in its plan.** That's the failure the
  graph exists to remove.
- **Rules inside node functions.** Testable only by running a graph, and the
  evals would need their own copy.
