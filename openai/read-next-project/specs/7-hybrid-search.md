# Book 7 — hybrid search

**Status:** not built. Contracts binding, cell order a plan.

## What you can do after this that you couldn't before

Search for `GraphRAG` and actually get GraphRAG papers. Dense embeddings match
meaning and are hopeless at a rare token they have barely seen; BM25 is the
opposite. This book runs both and fuses them.

## Builds on

Book 3's `Hit` and `dedupe_to_papers`, book 5's replay, book 6's filters.

## Module contracts

`readnext/lexical.py`

```python
class BM25Index:
    def __init__(self, chunks: list[Chunk])
    def search(self, query_text: str, k: int, where: Filter | None = None) -> list[Hit]
    # returns Hit(source="bm25")
```

`readnext/search.py` additions

```python
rrf(rankings: list[list[str]], k: int = 60) -> list[str]
weighted_fusion(dense, lexical, w: float) -> list[str]
hybrid_search(store, bm25, query_text, config) -> list[Hit]
```

## Notebook outline (plan)

| # | kind | idea |
| --- | --- | --- |
| 0 | md | title — book 2 showed embeddings encode topic; here is the bill for that |
| 1 | md | **Where dense loses.** A bare acronym. Predict where the real paper ranks before running |
| 2 | code | `search(store, "GraphRAG")` — read the titles |
| 3 | md | **Counting words instead.** What BM25 actually does: rare words count more, long documents count less, in one formula shown on three toy documents |
| 4 | code | term frequencies by hand on three sentences |
| 5 | code | `BM25Index` over the corpus; the same acronym query |
| 6 | md | **Where BM25 loses.** A paraphrase sharing no words with the abstract |
| 7 | code | the same paraphrase through both retrievers, side by side |
| 8 | md | **Two rankings, no common scale.** A cosine of 0.42 and a BM25 score of 11.3 cannot be added. That is the whole problem fusion solves |
| 9 | md | **Reciprocal Rank Fusion.** Use position, not score: `1/(k + rank)` summed across retrievers. Shown as numbers on two 5-item lists first |
| 10 | code | `rrf` on the toy lists, then on the real query |
| 11 | md | **Weighted fusion, for contrast** — needs normalisation, and the normalisation is where it goes wrong |
| 12 | code | both fusions on the same queries |
| 13 | md | **Sweep the constants** — the RRF `k`, and the dense/lexical weight |
| 14 | code | sweep by replay |
| 15 | md | **The side effect worth naming.** BM25 surfaces papers dense never showed you. Using the app after this book widens the log's coverage — the gap ADR-0005 admits, closing itself |
| 16 | code | count papers in BM25's pool that dense's pool never contained |
| 17 | md | **Two new rows.** Which query types does each retriever own? |
| 18 | code | `!python -m readnext.eval --replay --config all` |
| 19 | md | closing — a better pool, same ordering logic; book 8 reorders the pool |

## Done when

- `+ bm25 (rrf)` and `+ bm25 (weighted)` are rows in the table.
- A written note on which query types each retriever owns.
- You have run a few sessions *after* building it, so the log covers papers
  dense search never surfaced.

## Open questions

1. BM25 over `text` (the window) or `context` (the full abstract)? Different
   length normalisation. Starting position: `text`, to keep the unit identical
   to dense.
2. Does BM25 need its own `where` implementation, or should filtering happen
   after fusion? Pre-filter both, per book 6's conclusion.
