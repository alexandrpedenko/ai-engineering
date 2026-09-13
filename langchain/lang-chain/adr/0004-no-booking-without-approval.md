# ADR-0004 — No reservation without explicit approval

**Status:** Accepted (2026-09-13)

## Context

A model that can call `make_reservation` will, sooner or later, call it when
the user only asked "what would it cost". Book 7 makes this worse on purpose
with a poisoned policy document. Whatever the prompt says, the prompt is not
the enforcement point.

## Decision

`make_reservation` is always wrapped by `HumanInTheLoopMiddleware` with
`interrupt_on={"make_reservation": True}`. The loop pauses before the tool
runs; the write happens only when the run is resumed with an approve (or an
edit) decision. `build_agent()` adds this middleware unconditionally — a
caller cannot construct an agent that books without it.

Before book 5 introduces the middleware, `make_reservation` is not in the
agent's tool list at all.

## Consequences

- The invariant holds by construction, not by prompt; book 7's injection
  test passes for the reservation case before any guardrail middleware exists.
- Every booking needs a checkpointer and a `thread_id`, since interrupts
  require persistence. That is why thread memory and HITL share book 5.
- Projects 2 and 3 import `make_reservation` and must re-establish the
  invariant in their own harness (`interrupt()` in the graph, `interrupt_on`
  in the deep agent). This ADR is the reminder.

## Alternatives considered

- **Prompt-only ("always confirm before booking").** Works most of the time;
  most of the time is the problem.
- **A `confirmed: bool` argument on the tool.** The model fills it in, so it
  proves nothing.
