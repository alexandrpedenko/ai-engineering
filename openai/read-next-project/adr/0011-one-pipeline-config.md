# ADR-0011 — One `PipelineConfig`, one code path

**Status:** Accepted (2026-09-06)

## Context

Each book adds a technique that must be comparable against its absence. The
obvious implementation — a branch, or a second function, per technique — means
"with BM25" and "without BM25" slowly stop differing by only BM25, and the
comparison quietly stops being a comparison of one change.

## Decision

One dataclass carries every switch, and the ranking code reads flags instead of
branching into separate paths:

```python
@dataclass
class PipelineConfig:
    use_structured_query: bool = False   # book 6
    use_bm25: bool = False               # book 7
    use_rerank: bool = False             # book 8
    use_mmr: bool = False                # book 8
    fusion: Literal["rrf", "weighted"] = "rrf"
    alpha: float = 0.7                   # query vs taste blend
    candidate_chunks: int = 200
    candidates_k: int = 40
    final_k: int = 5
```

Every row of the ablation table is this dataclass with one field changed. The
defaults are book 4's behaviour, so `PipelineConfig()` is the baseline.

`recommend(store, query_vector, profile, config)` stays pure — no session, no
disk, no state — so it can be replayed thousands of times.

## Consequences

- Adding a technique means adding a flag and a branch *inside* the one pipeline,
  not a new pipeline.
- A config is serialisable, so an event can record which one produced it.
- The pipeline function accumulates conditionals. Accepted: legibility of the
  comparison matters more here than purity of the function.

## Alternatives considered

- **Composable ranker objects** (`Rerank(Fuse(Dense(), BM25()))`). Cleaner in
  the abstract, but the ablation table becomes a set of hand-built object graphs
  rather than one dataclass with a field flipped.
