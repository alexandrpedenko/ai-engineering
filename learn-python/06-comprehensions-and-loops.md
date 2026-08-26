# Comprehensions, `enumerate`, `zip`, slicing

**List comprehension**, from `embed.py`:

```python
keys = [_cache_key(t, model) for t in texts]
```

This builds a new list by applying `_cache_key(t, model)` to every `t` in
`texts`. It's shorthand for:

```python
keys = []
for t in texts:
    keys.append(_cache_key(t, model))
```

Comprehensions are preferred in idiomatic Python when the loop body is just
"transform each item and collect the results" — one line, no side effects,
no early exits.

A second example a few lines later:

```python
batch_texts = [texts[i] for i in batch_idx]
```

Same shape: for every index `i` in `batch_idx`, look up `texts[i]`, collect
into a new list.

**`enumerate`**, from `embed_texts`:

```python
to_fetch: list[int] = []
for i, key in enumerate(keys):
    path = _cache_path(key, cache_dir)
    if path.exists():
        vectors[i] = np.load(path)
    else:
        to_fetch.append(i)
```

Looping over `keys` directly would only give you each `key`, with no way to
know *which position* it came from. `enumerate(keys)` yields `(0, keys[0])`,
`(1, keys[1])`, `(2, keys[2])`, ... — pairs of (index, value) — which the loop
immediately unpacks into two variables, `i` and `key`. The index `i` is
needed here because the code writes the result into `vectors[i]` at that same
position, keeping the output vectors in the same order as the input `texts`
even though the cached and to-be-fetched items get handled differently.

**`zip`**, from `embed_texts`:

```python
for idx, item in zip(batch_idx, response.data):
    vector = np.array(item.embedding, dtype=np.float32)
    vectors[idx] = vector
    np.save(_cache_path(keys[idx], cache_dir), vector)
```

`zip(a, b)` walks two (or more) sequences in lockstep, yielding paired
elements: `(a[0], b[0])`, `(a[1], b[1])`, etc. Here it pairs each original
index in `batch_idx` with the corresponding embedding result in
`response.data` — the OpenAI API returns embeddings in the same order it
received texts, so `zip` is exactly how you recombine "which index does this
result belong to" with "the result itself."

**Slicing**, from `embed_texts`:

```python
for start in range(0, len(to_fetch), batch_size):
    batch_idx = to_fetch[start : start + batch_size]
```

`sequence[start:stop]` extracts a sub-sequence from index `start` up to (but
not including) `stop`. If `to_fetch` has 250 items and `batch_size` is 100,
this loop produces slices `[0:100]`, `[100:200]`, `[200:300]` (Python slicing
never errors on an out-of-range stop — `[200:300]` on a 250-item list just
returns the last 50 items). This is the standard way to chunk a list into
fixed-size pieces without writing manual bounds-checking.

**Dict/list "multiply to preallocate"**, from `embed_texts`:

```python
vectors: list[np.ndarray | None] = [None] * len(texts)
```

`[None] * n` creates a list of `n` `None`s — a common way to preallocate a
list of a known size, filled with placeholders that get overwritten in a
following loop (`vectors[i] = ...`). This only works safely because `None` is
immutable — `[[]] * n` would be a bug, since it repeats *the same* inner list
object `n` times rather than creating `n` independent lists.
