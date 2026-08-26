# Type hints

Python is dynamically typed — it never *requires* you to declare a variable's
type. Type hints are optional annotations that document intent and let tools
(mypy, pyright, your editor) catch mistakes before you run the code. Python
itself mostly ignores them at runtime.

**Function signatures**, from `embed.py`:

```python
def embed_texts(
    texts: list[str],
    model: str = EMBEDDING_MODEL,
    cache_dir: Path = EMBEDDING_CACHE_DIR,
    batch_size: int = EMBEDDING_BATCH_SIZE,
) -> np.ndarray:
```

Reading this without running it tells you: `texts` must be a list of strings,
`model` and `cache_dir` and `batch_size` have sensible defaults (so callers
can omit them), and the function returns a NumPy array. The `-> np.ndarray`
after the closing paren is the *return type*.

**`list[str]`** is the modern way to say "a list containing strings" (Python
3.9+). Older code (or code supporting older Python) writes this as
`List[str]`, imported from the `typing` module. Same idea, different spelling.

**The `X | None` union syntax**, from `embed.py`:

```python
_client: OpenAI | None = None
...
vectors: list[np.ndarray | None] = [None] * len(texts)
```

`OpenAI | None` means "either an `OpenAI` instance, or `None`." This is
Python's modern spelling (3.10+) of what used to require
`Optional[OpenAI]` from `typing`. It shows up whenever a value starts out
unset and gets filled in later — exactly the situation in
[05-global-singleton.md](05-global-singleton.md).

**`from __future__ import annotations`**, the very first line of code in
`embed.py` (after the docstring):

```python
from __future__ import annotations
```

This tells Python to treat all type annotations in the file as plain text
rather than evaluating them immediately. Practically, it's what lets code
targeting older Python versions use the newer `X | None` / `list[str]` syntax
in annotations without crashing, and it also lets a type hint reference a
class before that class is fully defined further down the file. It has zero
effect on runtime behavior beyond how annotations are stored.

**Type hints don't enforce anything by themselves.** Nothing stops you from
calling `embed_texts(texts=42)` — Python will happily try to run the function
body and fail wherever `42` doesn't behave like a list of strings. The hints
are a promise to readers and tools, not a runtime guard.
