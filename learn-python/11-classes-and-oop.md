# Classes & OOP

This codebase is mostly *functions and module-level constants* — there's
exactly one class in sight, and it's imported, not written here:

```python
from openai import OpenAI
...
_client = OpenAI(api_key=api_key)
```

`OpenAI` is a class; `OpenAI(api_key=...)` is *instantiating* it — calling
the class like a function runs its `__init__` and hands back an *instance*,
an object bundling data (the API key, internal HTTP session) with the
methods that use it (`.embeddings.create(...)`). `_client` is a reference to
that one instance, which is exactly why [05-global-singleton.md](05-global-singleton.md)
bothers to build it only once and reuse it — constructing an `OpenAI`
instance sets up connection machinery you don't want to redo per call.

**Why this codebase doesn't need its own classes.** `config.py` is a bag of
constants; `embed.py` is a bag of functions operating on plain data
(`list[str]`, `np.ndarray`, `Path`). There's no meaningful *state* that needs
to be bundled with behavior — a class would just be a more ceremonious way to
group things that a module already groups fine. This is a real, common
judgment call: reach for a class when you have state + behavior that travel
together and need multiple independent instances; reach for a module of
functions when you don't.

**Where a class *would* earn its keep here.** The dict built in `_log_cost`:

```python
record = {
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "model": model,
    "texts_requested": num_texts,
    "texts_cached": num_cached,
    "texts_embedded": num_texts - num_cached,
    "tokens": tokens,
    "cost_usd": tokens / 1_000_000 * EMBEDDING_PRICE_PER_1M_TOKENS,
}
```

is exactly the kind of "bundle of named fields" a `@dataclass` exists for:

```python
from dataclasses import dataclass, asdict
from datetime import datetime, timezone

@dataclass
class CostRecord:
    model: str
    texts_requested: int
    texts_cached: int
    tokens: int
    cost_usd: float
    timestamp: str = ""

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.now(timezone.utc).isoformat()

    @property
    def texts_embedded(self) -> int:
        return self.texts_requested - self.texts_cached
```

`@dataclass` (see [10-decorators.md](10-decorators.md)) auto-generates
`__init__`, `__repr__`, and `__eq__` from the type-annotated fields, so you
get `CostRecord(model="...", texts_requested=10, ...)` "for free," plus a
readable `repr()` when you print one in a notebook — a plain dict just shows
`{...}`, while a dataclass shows `CostRecord(model='...', ...)`. `asdict(record)`
converts it back to a dict for `json.dumps`.

**Dunder (magic) methods**, the mechanism behind a lot of "built-in-feeling"
syntax you've already met:

- `Path.__truediv__` is why `DATA_DIR / "index"` works ([02-pathlib.md](02-pathlib.md)).
- A context manager's `__enter__`/`__exit__` is why `with COST_LOG_FILE.open("a") as f:`
  guarantees cleanup ([08-files-and-context-managers.md](08-files-and-context-managers.md)).
- `__init__` runs when you call `ClassName(...)`; `__repr__` controls what
  prints; `__eq__` controls what `==` does between two instances of your
  class. Without a custom `__eq__` (which `@dataclass` generates for you),
  `==` falls back to identity — two separately-constructed instances with
  identical fields would compare unequal, which is rarely what you want for
  a plain data holder like `CostRecord`.

**Lightweight alternatives to a full class**, worth knowing before reaching
for `@dataclass`:

- `typing.NamedTuple` — like a dataclass, but immutable and tuple-like
  (unpacks with `a, b = my_namedtuple`).
- `TypedDict` — for when you want to keep using a plain `dict` at runtime
  (e.g. because it still needs to go straight into `json.dumps`) but want a
  type checker to verify the keys/types, e.g.:

  ```python
  from typing import TypedDict

  class CostRecordDict(TypedDict):
      timestamp: str
      model: str
      texts_requested: int
      texts_cached: int
      texts_embedded: int
      tokens: int
      cost_usd: float
  ```

  This is arguably the *least* invasive upgrade to `_log_cost`'s `record`
  dict — same runtime behavior, added type safety, no new object type to
  reason about.
