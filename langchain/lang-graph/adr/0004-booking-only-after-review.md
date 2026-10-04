# ADR-0004 — Booking runs only after an approved review, and is idempotent

**Status:** Proposed (2026-10-04)

## Context

Project 1's ADR-0004 (no reservation without explicit approval) was
enforced by `HumanInTheLoopMiddleware` inside `create_agent`. The planner is
a graph, so that middleware doesn't apply; the guarantee has to be rebuilt
in the graph. A graph adds a second risk: when a run resumes after
`interrupt()`, the interrupted node runs again from its first line, and a
resume can be sent twice (a retried request, a second keypress).

## Decision

- `book` is reachable only from `review_draft`, and only when the decision
  passed to `Command(resume=...)` is an approval. No other edge leads to it.
- `review_draft` has no side effects before its `interrupt()` call.
- `BookingsAdapter.book` takes an idempotency key derived from the thread
  and the stay; the same key returns the existing reservation instead of
  writing a new one. Reservations are still written only by
  `hotelbot.reservations.add_reservation` (P1 ADR-0006).

## Consequences

- A graph test can prove the invariant with a fake model: every route to
  `book` passes through an approved interrupt; two identical resumes write
  one reservation.
- Book 6 shows the double-write before it shows the key, so the fix has a
  reason.
- Project 3 runs the planner in draft-only mode and keeps booking in the
  parent agent.

## Alternatives considered

- **Interrupt inside `book`.** Puts the side effect and the pause in the
  same node — the re-run-on-resume problem in its worst place.
- **Trust that resume is sent once.** It isn't, in any real client.
