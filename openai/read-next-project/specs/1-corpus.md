# Book 1 — the corpus

**Status:** built (`1-corpus.ipynb`, 17 cells)
**Decides:** ADR-0002 (fixed committed corpus), ADR-0003 (small-to-big chunking)

## What you can do after this that you couldn't before

Load 1,693 real arXiv papers from disk in one call, in a record shape every
later book depends on, and say what embedding them will cost before spending it.

## Builds on

Nothing. This is the first book.

## Module contracts — `readnext/corpus.py`

```python
@dataclass
class Paper:
    id: str; title: str; abstract: str
    authors: list[str]; categories: list[str]; primary_category: str
    published: str; updated: str; url: str

@dataclass
class Chunk:
    chunk_id: str
    paper_id: str
    text: str        # the unit that gets embedded
    context: str     # the unit that gets shown — equal to text unless small_to_big

ChunkStrategy = Literal["whole", "window", "small_to_big"]

fetch_corpus(categories, since, target_total) -> list[Paper]
save(papers, path) -> None
load(path=PAPERS_FILE) -> list[Paper]
chunk(papers, strategy, window_size=2, overlap=1) -> list[Chunk]
count_tokens(text) -> int
estimate_embedding_cost(texts) -> tuple[int, float]
```

## Notebook outline (as built)

| # | kind | idea |
| --- | --- | --- |
| 0 | md | title — one record shape, frozen here |
| 1 | md | **Fetching** — Atom feed, paged 100, stop when a page crosses `since`; merge by id so multi-category papers keep every category; 3s delay is arXiv's own etiquette |
| 2–3 | code | config constants, then `fetch_corpus` |
| 4–5 | md/code | **The record contract** — one paper, normalised |
| 6–7 | md/code | **Sanity checks** — unique ids, multi-category merge worked, category breakdown |
| 8–9 | md/code | **Commit the corpus** — save, reload, assert equal |
| 10–11 | md/code | **Token counts and cost** — "1,693 papers" becomes tokens and dollars |
| 12–13 | md/code | **What's a chunk?** — three strategies compared by eye on 2 papers |
| 14 | md | `window` and `small_to_big` embed identical text; only `context` differs |
| 15 | code | all three strategies costed over the whole corpus |
| 16 | md | **Decision: `small_to_big`** — window precision at window cost, with a route back to the paper |

## Data written

`data/papers.jsonl` — 1,693 records, committed.

## Done when

- `readnext.corpus.load()` returns the corpus; `chunk(papers, strategy=...)`
  supports all three strategies.
- You can state in one sentence why `small_to_big` was chosen. (ADR-0003.)

## Not in this book

Embedding anything (book 2). Search (book 3). Cost *logging* as opposed to cost
*estimation* — `estimate_embedding_cost` predicts, `embed.py` records.

## Known stale references

None.
