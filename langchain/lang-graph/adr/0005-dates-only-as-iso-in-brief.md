# ADR-0005 — Dates come only as ISO strings stated in the brief

**Status:** Accepted (2026-10-04)

## Context

Project 1's ADR-0002 keeps dates as fixed ISO strings and never parses them
from text. A trip brief in plain language invites "5 days next month",
which would need a calendar, a "today", and a model guessing.

## Decision

`parse_brief` extracts dates only when the brief states them as ISO dates
(`2026-10-10`). Anything else leaves `start` / `end` empty, and
`missing_fields` sends the brief to `ask_for_clarification`. Night counts
are the only date arithmetic, done in `domain/rules.py`. Transport runs on a
daily timetable, so no weekday logic exists.

## Consequences

- The clarification edge (book 1) has a real, frequent case to handle.
- Sample briefs and the eval dataset state dates as ISO.

## Alternatives considered

- **Let the model resolve relative dates against `TODAY`.** A wrong date is a
  wrong booking; not worth it for a learning project.
