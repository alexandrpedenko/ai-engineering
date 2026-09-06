# ADR-0006 — Build order: application, then measurement, then techniques

**Status:** Accepted (2026-09-06)
**Supersedes:** the original notebook order, which put the golden set and
metrics at book 4 and the interactive product at book 8.

## Context

The original spec declared the ablation table "the whole point of the project".
That framing has an ordering consequence: a table needs a test set, a test set
must exist before the first technique, so measurement lands early and the
product — the loop the project exists to build — gets pushed behind four
notebooks of retrieval machinery.

Two symptoms showed the order was wrong. The headline function took a `profile`
argument that did not exist until book 8, so books 4–7 ran on a hardcoded fake.
And book 4 measured a thing nobody had used, which left every number without a
reason to care about it.

## Decision

Three phases, in this order:

1. **The application** (book 4) — query, five cards, buttons, taste vector,
   event log. No LLM, no metrics, no new retrieval technique.
2. **The measurement** (book 5) — click metrics, replay, interleaving, built on
   the log book 4 produced by being used.
3. **The techniques** (books 6–9) — each one lands as a `PipelineConfig` flag
   and has to earn its row.

The ablation table is demoted from "the point" to the instrument that says
whether the last change to the app was real.

## Consequences

- Nothing is faked. `Profile` exists from book 4, empty at cold start, and grows.
- Book 5's metrics have a motivation that book 4 supplied: a working app you can
  feel is mediocre but cannot yet describe numerically.
- Query understanding moved to book 6 (ahead of BM25) because it is product
  surface, not a retrieval optimisation.
- The risk is improving by vibes between books 4 and 5. Mitigated by measurement
  being one notebook later, not five earlier.

## Alternatives considered

- **Measurement first (the original).** Rejected above.
- **Ship all nine as planned and reorder later.** Reordering after the fact
  means rewriting the notebooks anyway.
