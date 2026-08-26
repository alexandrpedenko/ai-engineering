# Decorators: a bonus tour

Neither `config.py` nor `embed.py` actually uses a decorator, so this file is
extra — but decorators are common enough elsewhere in Python (and likely
elsewhere in this repo's notebooks) that they're worth covering, and they
connect directly to ideas already seen in `embed.py`.

**What a decorator is.** A decorator is a function that wraps another
function, adding behavior before/after/around a call without changing the
wrapped function's own code. The `@` syntax:

```python
@some_decorator
def my_function():
    ...
```

is exactly equivalent to:

```python
def my_function():
    ...
my_function = some_decorator(my_function)
```

That's it — `@decorator` above a `def` is shorthand for "pass this function
through `decorator` and rebind the name to whatever comes back."

**A decorator you could plausibly add to `embed.py`: caching.** The
`embed_texts` function in `embed.py` hand-rolls a disk cache (`_cache_key`,
`_cache_path`, checking `path.exists()` before calling the API). The standard
library actually ships a decorator for the simpler in-memory version of this
exact pattern:

```python
from functools import lru_cache

@lru_cache(maxsize=None)
def expensive_lookup(x):
    ...  # runs once per distinct x; repeat calls return the cached result
```

`embed_texts` couldn't just use `@lru_cache` as-is — its cache needs to
survive across separate Python process runs (hence writing `.npy` files to
disk, not just holding results in memory) and needs a cache key that depends
on both the model *and* the text. But it's the same underlying idea: don't
redo expensive work you've already paid for once, which is directly the "why"
behind `_cache_key`/`_cache_path` in [05-global-singleton.md](05-global-singleton.md)-adjacent
territory.

**Decorators you'll see constantly in this kind of codebase:**

- `@dataclass` (from `dataclasses`) — auto-generates `__init__`, `__repr__`,
  and `__eq__` for a class that's mostly just a bundle of typed fields.
  `config.py`'s constants could plausibly become a `@dataclass Settings`
  instead of loose module-level variables, trading "grep for the name" for
  "autocomplete on `settings.`".
- `@staticmethod` / `@classmethod` — mark a method that doesn't need (or
  needs a different kind of) access to the instance.
- `@property` — lets you call an attribute-like `obj.value` that's actually
  computed by a method under the hood.
- Notebook/framework-specific ones you'll meet elsewhere in an AI-bootcamp
  context: `@app.route(...)` (Flask), `@pytest.fixture` (pytest),
  `@retry(...)` (tenacity, for retrying flaky API calls — genuinely useful
  next to `client.embeddings.create(...)` in `embed.py`, which currently has
  no retry logic at all if the OpenAI call fails transiently).

**The mechanical trick behind `@property` and friends**, connecting back to
[02-pathlib.md](02-pathlib.md): both decorators and `Path`'s overloaded `/`
operator rely on the same underlying idea — Python classes can define
special "dunder" methods (`__truediv__`, `__enter__`, `__call__`, ...) that
hook into built-in syntax. A decorator is just a plain callable object (often
a plain function) that happens to be used in a special syntactic position;
there's no deeper magic than "functions are values you can pass around and
call."
