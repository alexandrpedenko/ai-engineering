# ADR-0007 — Retrieval and personalisation are two stages

**Status:** Accepted (2026-09-06)

## Context

"Search" and "recommendation" were being treated as one thing. They answer
different questions and are measured by different evidence, and conflating them
makes it impossible to say whether a change improved the search or just happened
to suit one user.

## Decision

Two stages, kept separate in the code and in the metrics.

```
query
  │
  ▼
1. RETRIEVE — relevance        embeddings, BM25, filters
   same for every user         → ~40 candidate papers
  │
  ▼
2. RE-RANK — preference        blend with this user's taste vector
   different per user          → 5 papers, this user's order
  │
  ▼
5 cards
```

Stage 1 asks "is this paper about fine-tuning at all" — a correctness question,
the same answer for everyone, improved by books 6–8. Stage 2 asks "did *you*
want it" — a preference question, answered only by clicks.

The join between them is one dial:

```
search_vector = alpha * query_vector + (1 - alpha) * taste_vector
```

`alpha = 1` ignores the user; `alpha = 0` ignores what they typed. Book 5 sweeps
it.

## Consequences

- The event log stores `candidates` (stage 1 output) separately from `shown`
  (stage 2 output), which is what makes replay possible at all — replay
  re-runs stage 2 over a frozen stage 1.
- A technique can be attributed: a change that moves `hit@20` improved
  retrieval; one that moves nDCG with `hit@20` flat improved ordering.
- Two `k` values everywhere (`candidates_k`, `final_k`) rather than one.

## Alternatives considered

- **One blended scoring function.** Fewer moving parts, but no way to attribute
  an improvement to retrieval or to personalisation.
