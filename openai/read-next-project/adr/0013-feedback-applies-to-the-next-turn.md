# ADR-0013 — Feedback applies to the next turn, never to the list on screen

**Status:** Accepted (2026-09-12)

## Context

Book 4 was first built so that a click re-ranked the five cards in place: the
judged paper left, the rest re-ordered under the moved taste vector, the
sixth-best filled in. Using it showed two problems.

It is confusing to use — the thing you clicked disappears, and every other
card moves, with nothing on screen saying what happened or why.

It corrupts the log. An event row records `shown` once, when the turn is
drawn. After the first click the screen no longer matches the row: a second
click lands on a paper at a position the row doesn't know about, or on a paper
the row says was never shown. Every book-5 metric is "where in `shown` was the
paper you clicked", so in-place re-ranking undermines ADR-0005 from the first
click. Interleaving needs the list fixed for the whole turn.

## Decision

A turn is atomic: one query, one list, any number of signals — all against
that same list. `Session.feedback()` records the signal on the profile, in the
session, and on the log row of the turn that showed the paper, and marks the
card so the click is visibly acknowledged. It does not re-rank. The taste
vector is read once per turn, by `ask()`, so a click shapes the *next* list.

No query-similarity logic decides whether a click should affect a later query.
Stage 1 is query-only, so an unrelated question retrieves a pool with nothing
near the taste vector and the blend barely reorders it; a related question
retrieves near-neighbours of what was liked and the blend moves them a lot.
The effect is gated by construction.

## Consequences

- `shown` in an event is the whole truth about what the user saw on that turn.
  Replay and interleaving can trust it.
- The effect of a click is only visible on the next `ask()`. The notebook
  makes that the exercise: ask, rate, ask a paraphrase, compare.
- `feedback()` becomes simpler — no second call to stage 2.
- Whether a *per-topic* taste (query-conditioned memory) beats one global
  taste vector is a book-5 question with a number attached, not settled here.

## Alternatives considered

- **Re-rank in place, and log every re-draw as its own row.** Keeps the
  immediate effect but makes a "turn" mean two different things, and the
  metrics would have to decide which rows count.
- **Re-rank in place, keep the judged card pinned.** Fixes the disappearing
  card, not the log.
