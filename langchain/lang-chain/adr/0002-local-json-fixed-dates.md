# ADR-0002 — Local JSON files, fixed ISO dates

**Status:** Accepted (2026-09-13)

## Context

A booking agent could call a real hotel API and parse "next weekend". Both
pull attention from what the project teaches — how the agent loop works — into
HTTP errors and calendar arithmetic.

## Decision

The catalogue, the policies and the reservations are committed files under
`data/`. Availability is a list of inclusive ISO date ranges per hotel. Tools
take and return ISO date strings; the only date arithmetic anywhere is counting
nights. The model is told today's date in the system prompt and asked to
produce ISO strings; it does not get a date-parsing tool.

## Consequences

- Every tool is a pure function over a file, so a tool can be tested and
  traced without a network.
- `reservations.json` is written by the agent and gitignored after its empty
  initial state; a notebook can reset it with one line.
- "Next weekend" may produce a wrong date — that is the model's error to make
  and the user's to catch in the approval step (ADR-0004), not a bug to fix.
- Projects 2 and 3 inherit the same files, so their data is coherent with
  this one.

## Alternatives considered

- **SQLite catalogue.** Would be a fine backing store but adds SQL to the
  reading load with no gain at 40 rows.
- **A date-parsing tool (`dateparser`).** Deferred; the approval step covers
  the failure.
