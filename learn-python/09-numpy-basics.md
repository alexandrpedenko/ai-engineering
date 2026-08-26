# NumPy basics

NumPy is the library nearly every Python numerical/ML tool is built on
(pandas, PyTorch, scikit-learn all use its arrays underneath). Its core type
is the `ndarray` — an N-dimensional array of a single, fixed data type,
stored contiguously in memory, which is what makes it fast: unlike a Python
`list` (which holds pointers to arbitrary objects scattered in memory), a
NumPy array is a dense block of raw numbers, so operations on it run in
optimized C rather than a Python `for` loop.

**Converting a plain Python list into an array**, from `embed.py`:

```python
vector = np.array(item.embedding, dtype=np.float32)
```

`item.embedding` is a plain Python `list[float]` coming back from the OpenAI
API (something like `[0.0123, -0.0456, ...]`, one number per embedding
dimension). `np.array(...)` converts it into a NumPy array.

**`dtype=np.float32`** pins the array's data type to 32-bit floats. This
matters for two reasons: (1) it's explicit and predictable — without it,
NumPy would guess a type from the input, and (2) it's a deliberate size
trade-off. A `float64` (Python's native float precision) uses 8 bytes per
number; `float32` uses 4. For an embedding vector with, say, 1536 dimensions,
that's the difference between ~12KB and ~6KB per cached vector — it adds up
across thousands of cached embeddings, at a precision loss that doesn't
matter for similarity search.

**Saving and loading arrays to disk**, from `embed.py`:

```python
np.save(_cache_path(keys[idx], cache_dir), vector)
...
vectors[i] = np.load(path)
```

`.npy` is NumPy's own binary format for a single array — faster and more
compact than, say, writing the numbers out as JSON or CSV text, and it
round-trips the exact dtype and shape without any parsing logic of your own.
That's why `_cache_path` (in `embed.py`) builds paths ending in `.npy`.

**Stacking many vectors into one matrix**, from `embed_texts`:

```python
return np.stack(vectors)
```

At this point, `vectors` is a plain Python list of individual 1-D NumPy
arrays (one per input text, each of shape `(dim,)` — e.g. `(1536,)`).
`np.stack` combines them along a new axis into a single 2-D array of shape
`(len(texts), dim)` — the docstring says exactly this: *"Returns a
`(len(texts), dim)` float32 matrix."* This is the shape downstream code
expects: one row per document, ready to feed into a similarity search
(e.g. cosine similarity via matrix multiplication) or a vector index.

**Shape as a mental model.** With NumPy, always ask "what shape is this?"
`(dim,)` is one vector; `(n, dim)` is `n` vectors stacked into a matrix.
Most bugs in embedding/ML code trace back to a shape mismatch — e.g.
accidentally passing a `(dim,)` vector where a `(1, dim)` matrix was
expected.

**A couple of operations you'll likely meet next**, not in this file but
common once you have `(n, dim)` embeddings:

```python
# cosine similarity between every pair of rows, using plain matrix ops
normed = matrix / np.linalg.norm(matrix, axis=1, keepdims=True)
similarity = normed @ normed.T   # @ is matrix multiplication
```

`axis=1` means "reduce along columns, one result per row" — the same `axis`
argument shows up across nearly every NumPy reduction function (`sum`,
`mean`, `max`, `norm`, ...), and getting it right/wrong is the single most
common source of confusion for people new to the library.
