# Book 2 — embeddings

**Status:** built (`2-embeddings.ipynb`, 18 cells)
**Decides:** nothing new — implements ADR-0001 and ADR-0003

## What you can do after this that you couldn't before

Turn the whole corpus into vectors for a few cents, re-run any notebook for
free, and see for yourself that cosine similarity finds related papers with no
label ever having told it what "related" means.

## Builds on

Book 1's `Chunk` and the `small_to_big` strategy.

## Module contracts — `readnext/embed.py`

```python
embed_texts(texts, dimensions=None) -> np.ndarray   # batched, cached, cost-logged
cache_size() -> int
total_cost() -> float
```

Cache key is a hash of `(model, dimensions, text)`, stored under
`INDEX_DIR/embedding_cache`. Cost lines append to `COST_LOG_FILE`, one per run
that actually reached the API.

## Notebook outline (as built)

| # | kind | idea |
| --- | --- | --- |
| 0 | md | title — book 1 decided *what* gets embedded; this turns it into numbers |
| 1–2 | md/code | **Batching** — 100 texts per request, cache checked first |
| 3–4 | md/code | **First embed** — the one cell that costs money, timed |
| 5–6 | md/code | **The cache pays off** — same call, no API, identical array |
| 7–8 | md/code | **What did this cost** — cost log and cache size |
| 9–10 | md/code | **Cosine similarity by hand** — a normalised dot product, written out in numpy |
| 11–12 | md/code | **One vector per paper** — average a paper's chunk vectors, for eyeballing only |
| 13–14 | md/code | **Nearest neighbours** — pick a paper, read its neighbours' titles |
| 15–16 | md/code | **Failure mode: negation** — "not about transformers" lands nearest to transformer papers |
| 17 | md | closing — negation is book 6's job (`exclude_terms`), not the embedding's |

## Data written

`data/index/embedding_cache/` (gitignored), `data/index/cost_log.jsonl`.

## Done when

- The corpus is embedded and a re-run makes ~0 API calls.
- You can print the 5 nearest papers to any paper.
- You have seen negation fail.

## Not in this book

Any index structure (book 3). Paper-level vectors are computed here for the
demo only — the real index is chunk-level.
