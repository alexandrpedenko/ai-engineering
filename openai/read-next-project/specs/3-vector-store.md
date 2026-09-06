# Book 3 — the vector store

**Status:** built (`3-vector-store.ipynb`, 18 cells)
**Decides:** ADR-0004 (brute force behind a protocol)

## What you can do after this that you couldn't before

`search(store, "retrieval augmented generation", k=5)` — a query string in,
ranked papers out. This is the retrieval engine the whole application sits on.

## Builds on

Book 1's chunks, book 2's cached vectors.

## Module contracts

`readnext/store.py`

```python
Filter = dict[str, Any]

@dataclass
class Hit:
    chunk_id: str; paper_id: str; score: float
    source: Literal["dense", "bm25", "hybrid"]

class VectorStore(Protocol):
    def add(ids, vectors, meta) -> None
    def search(vector, k, where=None) -> list[Hit]

class NumpyStore(VectorStore)   # one matrix, argsort over a dot product
```

`readnext/search.py`

```python
build_dense_index(chunks, vectors) -> NumpyStore
dedupe_to_papers(hits, k) -> list[Hit]       # best chunk per paper, rank order kept
search(store, query_text, k=10, candidates_k=40, dimensions=None) -> list[Hit]
```

`where` is accepted now and unused until book 6 (ADR-0004).

## Notebook outline (as built)

| # | kind | idea |
| --- | --- | --- |
| 0 | md | title — same dot product, now behind a protocol |
| 1–2 | md/code | **The chunks, again** — nothing here reaches the API |
| 3–4 | md/code | **Build the index** — one `add` call, one meta row per chunk |
| 5–6 | md/code | **`search()` end to end** — embed, retrieve chunks, collapse to papers, cut to k |
| 7–8 | md/code | **A second query, by eye** — the first result wasn't a fluke |
| 9–10 | md/code | **Dimension reduction** — `dimensions=512` on the endpoint, one paid call |
| 11–12 | md/code | **Space** — half the dimensions, half the bytes |
| 13–14 | md/code | **Speed** — time both stores over the same query |
| 15–16 | md/code | **Does the ranking change?** — top-10 overlap as the honest proxy |
| 17 | md | closing — the dimension answer is provisional until there is something to score against |

## Done when

- `search(store, query_text, k=10)` returns sensible papers.
- `VectorStore` is a protocol with one implementation behind it.
- The dimension ablation has a provisional answer (half the space, faster,
  rankings mostly agree).

## Not in this book

BM25, filters, fusion, reranking. Any relevance number — there is nothing to
score against yet, which is exactly the gap book 4 and book 5 close.

## Known stale references — fix before book 4 lands

Cells 9 and 17 say the dimension question is answerable "once notebook 4's
golden set exists", and cell 17 says "notebook 5 adds a BM25 index". Under
ADR-0005 there is no golden set, and under ADR-0006 BM25 is book 7. Both
sentences need rewording to point at book 5's replay harness and book 7.
