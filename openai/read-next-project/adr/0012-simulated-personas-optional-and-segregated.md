# ADR-0012 — Simulated personas are optional and never mix with real events

**Status:** Accepted (2026-09-06)

## Context

ADR-0005 leaves the project measuring from one developer's clicks, which is
sparse. Testing whether the feedback loop converges needs many three-turn
sessions; hand-clicking two hundred of them is not going to happen honestly.

## Decision

Optional, book 9. `gpt-5` plays a persona from `personas.json` with a **hidden
declared interest** ("only cares about quantization for edge devices") and clicks
through three turns of real recommendations.

This is a **simulated user**, not a judge (ADR-0010). It produces behaviour, not
verdicts, and correctness comes from the persona sentence — written before the
search ran — rather than from trusting the model's taste. The measurement is
whether the app converged on the declared interest by turn 3.

Simulated sessions are written to a separate log and never merged into
`data/events.jsonl`.

## Consequences

- Loop behaviour can be measured at volume: bubble formation, the alpha/beta/gamma
  sweep, the diversity trade.
- Any conclusion drawn from it is about a model's idea of a researcher, not a
  researcher. Real-session numbers stay the headline.
- If it reads as noise, book 9 drops it and evaluates the loop from real
  sessions at smaller sample size. Nothing else depends on it.

## Alternatives considered

- **Only real sessions.** Honest but thin — three-turn convergence is hard to
  see in a handful of sessions.
- **Replaying real sessions with synthetic noise.** Cheaper, but it cannot test
  the loop, because a replayed session's clicks were made against a list the new
  ranker did not produce.
