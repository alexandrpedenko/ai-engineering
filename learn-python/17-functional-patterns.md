# Functional patterns: map/filter/lambda/sorted key

This codebase consistently reaches for **comprehensions** (see
[06-comprehensions-and-loops.md](06-comprehensions-and-loops.md)) rather than
`map`/`filter`/`lambda`:

```python
keys = [_cache_key(t, model) for t in texts]
batch_texts = [texts[i] for i in batch_idx]
```

That's a real, common style choice in modern Python — comprehensions are
generally considered more readable than the older functional-style
equivalents. It's still worth knowing the alternatives, both because you'll
meet them in other code and because some cases genuinely favor them.

**`map` and `filter`** are the direct equivalents of the comprehensions
above:

```python
keys = list(map(lambda t: _cache_key(t, model), texts))
# vs.
keys = [_cache_key(t, model) for t in texts]
```

```python
cached_only = list(filter(lambda i: _cache_path(keys[i], cache_dir).exists(), range(len(texts))))
# vs.
cached_only = [i for i in range(len(texts)) if _cache_path(keys[i], cache_dir).exists()]
```

Both `map` and `filter` return lazy iterators (like the generator
expressions in [13-iterators-and-generators.md](13-iterators-and-generators.md)),
not lists — hence wrapping them in `list(...)` above to see the result
eagerly. The comprehension versions read more naturally left-to-right in
Python (most style guides, including PEP 8's spirit, favor comprehensions
for exactly this reason), which is likely *why* this codebase never uses
`map`/`filter` even once. `map` still earns its keep when you already have a
named function and don't want to wrap it in a comprehension just to call it:
`list(map(str.strip, lines))` reads about as cleanly as
`[line.strip() for line in lines]` — a wash either way, pick whichever reads
better for the specific case.

**`lambda`** — an anonymous, single-expression function. `_cache_key` itself
could not be a `lambda` (it has multiple meaningful lines and a docstring
would be nice), but a `lambda` is exactly the right size for a one-off "just
extract this field" function passed to something else, which is by far its
most common real use: the `key=` argument to `sorted`.

**`sorted(..., key=...)`** — genuinely useful for this project's data, not
present in `embed.py`/`config.py` but a very natural fit for `PAPERS_FILE` /
`GOLDEN_FILE` records once loaded:

```python
papers = [json.loads(line) for line in PAPERS_FILE.open()]

newest_first = sorted(papers, key=lambda p: p["published"], reverse=True)

top_5_by_similarity = sorted(scored_papers, key=lambda p: p["score"], reverse=True)[:5]
```

`key=` tells `sorted` *what to compare*, without changing what gets
returned — it sorts the full `papers` dicts, using each one's `"published"`
field only to decide the order. This is a much more common use of `lambda`
in everyday Python than `map`/`filter`. The equivalent named-function version
(when the sort key is complex enough to deserve a name):

```python
def by_recency(paper: dict) -> str:
    return paper["published"]

newest_first = sorted(papers, key=by_recency, reverse=True)
```

**`functools.reduce`** — the least commonly needed of this family, folding a
sequence down to a single value by repeatedly applying a function:

```python
from functools import reduce
total_tokens = reduce(lambda acc, batch: acc + batch.usage.total_tokens, responses, 0)
# vs., far more idiomatic here:
total_tokens = sum(batch.usage.total_tokens for batch in responses)
```

`embed_texts` actually has this exact shape already — `tokens_billed += response.usage.total_tokens`
accumulated across a loop — and the loop version (or `sum(...)` over a
generator expression) is the clearer choice in Python. `reduce` is worth
recognizing when you meet it, but reaching for it over a plain loop or `sum`
is rarely an improvement; Guido van Rossum (Python's creator) has said as
much publicly, which is part of why `reduce` was demoted from a builtin to
`functools` in Python 3.

**The overall takeaway matches this codebase's own choices:** comprehensions
and generator expressions cover the vast majority of cases cleanly;
`map`/`filter`/`lambda` are good to recognize and occasionally reach for
(especially `sorted(..., key=lambda ...)`), and `reduce` is good to
recognize and almost never reach for.
