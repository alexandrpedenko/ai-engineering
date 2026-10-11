# ADR-0008 — Relative dates are resolved against a fixed "today" from the context

**Status:** Accepted (2026-10-11). Supersedes ADR-0005.

## Context

ADR-0005 let `parse_brief` keep only dates written as ISO dates. People
rarely write a trip that way: "this Saturday for 5 nights" and "the 20th to
the 24th" are the normal case, and under ADR-0005 every one of them goes to
clarification. A model can turn those phrases into dates if it is told what
day it is today.

ADR-0005's worry still holds: a wrong date is a wrong booking. Three things
now catch a wrong date before it does harm. The dates are checked in code
(`missing_fields`). The reply shows them back as a table (book 1). And nothing
is booked until the draft is approved (ADR-0004, book 6). An eval can also
measure how often the model gets them right (ADR-0007).

## Decision

- **`parse_brief`'s system message states today's date and its weekday**,
  e.g. "Today is Monday, 2026-10-05". Both come from `TripContext.today`; the
  weekday is computed in code, not by the model.
- **A phrase that names a day is resolved**: "this Saturday", "next Monday",
  "the 20th", "October 22", and a day plus a length ("for 5 nights", "for a
  week"). A day and month without a year means the next such date on or
  after today.
- **A period that names no day is not**: "next week", "in October", "in
  autumn" leave `start` and `end` empty, and the brief goes to clarification.
- **`today` is a fixed date by default**: `config.TODAY = "2026-10-05"`, a
  Monday inside the hotel data's October window. `make_context(today=...)`
  overrides it. Tests and eval rows always set it.
- **Dates still leave the model as ISO strings**, and `missing_fields` treats
  one it can't parse as missing. Nights and the split are computed in code
  (ADR-0002, unchanged).

## Consequences

- Fewer briefs go to clarification for dates. "next week" still does.
- Every `parse` eval row carries the `today` it was written against, and the
  dataset has relative-date cases scored per field.
- The CLI's "this Saturday" is 2026-10-10 whatever the real date is. The
  welcome message says which day "today" is.
- Counting days from today is done by the model. The `parse` eval measures
  how often it's right.

## Alternatives considered

- **Keep ADR-0005 (ISO dates only).** Safe, but almost every brief written in
  words asks for its dates.
- **The real clock (`date.today()`).** After 2026-10-31, "this Saturday" falls
  outside the hotel data (Oct 1–31 and Dec 1–20), so every later book would
  find no rooms.
- **Resolve the phrase in code.** The model extracts "this Saturday" and "5
  nights", and a function computes the dates. Exact, but it needs a grammar of
  date phrases, and reading phrases is the job the model is in the graph for.
- **"next week" means Monday to Sunday.** Picks a length nobody stated.
