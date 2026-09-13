# ADR-0007 — Tracing on from the first cell

**Status:** Accepted (2026-09-13)

## Context

Observability is usually bolted on at the end. Then the trace UI is new at
exactly the moment the agent is at its most complex.

## Decision

`hotelbot/config.py` sets `LANGSMITH_TRACING=true` and
`LANGSMITH_PROJECT="hotelbot-book-<n>"` when imported; every notebook imports
it in cell 1. Book 1's second cell already links to its own trace. Book 8 is
where the traces are *read* deliberately — tokens, latency, cost, tool
calls — not where tracing starts.

## Consequences

- Seven books of traces exist before book 8 asks you to look at them, and
  book 8 can compare a book-1 trace with a book-7 one.
- One project per book keeps the UI navigable.
- A missing `LANGSMITH_API_KEY` must not break a notebook: `config.py` warns
  and continues untraced.
- Traces contain full prompts and tool outputs; book 7 shows masking for the
  one field (a card number) that shouldn't be there.
