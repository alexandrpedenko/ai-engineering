# Functions: defaults, keyword args, batching

**Default argument values**, from `embed.py`:

```python
def embed_texts(
    texts: list[str],
    model: str = EMBEDDING_MODEL,
    cache_dir: Path = EMBEDDING_CACHE_DIR,
    batch_size: int = EMBEDDING_BATCH_SIZE,
) -> np.ndarray:
```

Any parameter with `= something` after its type hint is optional — callers
can leave it out and get the default. So elsewhere in the project you might
see both:

```python
embed_texts(paper_abstracts)
embed_texts(paper_abstracts, model="text-embedding-3-large", batch_size=50)
```

The second call is using **keyword arguments** — `model="..."` — which name
the parameter explicitly instead of relying on position. This is why the
defaults pull from `config.py` constants (`EMBEDDING_MODEL`,
`EMBEDDING_CACHE_DIR`, `EMBEDDING_BATCH_SIZE`) rather than being hardcoded
twice: the constant is the single source of truth, and the function
parameter just names it as the fallback.

⚠️ A classic gotcha *not* present here but worth knowing: default values are
evaluated **once**, when the function is defined, not on every call. That's
totally fine for `EMBEDDING_MODEL` (an immutable string), but it's a famous
trap for mutable defaults:

```python
def add_item(item, bucket=[]):   # BAD: the same list is reused every call!
    bucket.append(item)
    return bucket
```

The fix is `bucket=None` and then `if bucket is None: bucket = []` inside the
function body.

**Private/internal helpers get a leading underscore**, from `embed.py`:

```python
def _cache_key(text: str, model: str) -> str:
    ...

def _cache_path(key: str, cache_dir: Path) -> Path:
    ...

def _log_cost(model: str, num_texts: int, num_cached: int, tokens: int) -> None:
    ...
```

The underscore prefix is a *convention*, not an enforced rule — Python won't
stop you from calling `embed._cache_key(...)` from outside the module. It
signals "this is an implementation detail of this module, don't rely on it
from elsewhere." Compare to `embed_texts`, `cache_size`, and `total_cost`,
which have no underscore: those are the module's public API, meant to be
imported and called from notebooks.

**Batching in a loop**, from `embed_texts`:

```python
for start in range(0, len(to_fetch), batch_size):
    batch_idx = to_fetch[start : start + batch_size]
    batch_texts = [texts[i] for i in batch_idx]
    response = client.embeddings.create(input=batch_texts, model=model)
```

`range(0, len(to_fetch), batch_size)` produces `0, batch_size, 2*batch_size, ...`
— the *step* argument to `range` — so this loop walks through `to_fetch` in
fixed-size chunks rather than one item at a time. `to_fetch[start : start + batch_size]`
is a *slice*: see [06-comprehensions-and-loops.md](06-comprehensions-and-loops.md)
for more on slicing. The reason to batch at all: the OpenAI embeddings API
accepts a list of texts per request, so sending 100 at once is far cheaper
(one HTTP round trip) than sending them one by one.
