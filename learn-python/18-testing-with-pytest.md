# Testing with pytest

None of this project's functions currently have tests — `nbconvert` and
`ipykernel` in the `Pipfile`'s `[dev-packages]` (see
[16-dependencies-and-environments.md](16-dependencies-and-environments.md))
are for running notebooks, not automated tests. Here's what testing
`embed.py` would actually look like, and why it needs a bit of care because
of the OpenAI API call and the disk cache.

**A basic pytest test.** pytest test functions are just functions named
`test_*`, using plain `assert` — no special assertion methods to memorize:

```python
# test_embed.py
from readnext.embed import _cache_key, cache_size

def test_cache_key_differs_by_model():
    key_a = _cache_key("hello", "text-embedding-3-small")
    key_b = _cache_key("hello", "text-embedding-3-large")
    assert key_a != key_b

def test_cache_key_is_deterministic():
    assert _cache_key("hello", "m") == _cache_key("hello", "m")

def test_cache_size_empty_dir(tmp_path):
    assert cache_size(tmp_path) == 0
```

Running `pytest` discovers every `test_*.py` file and every `test_*` function
inside it, runs each, and reports which passed/failed with a diff of the
failing `assert`. `_cache_key` and `cache_size` are good first targets
precisely because they're pure-ish: given the same input, they always
produce the same output, no network call involved.

**`tmp_path`** in the third test above is a **pytest fixture** — a special
parameter name pytest recognizes and automatically supplies: a fresh,
temporary directory, unique per test, cleaned up afterward. This is exactly
what `cache_size(cache_dir: Path = EMBEDDING_CACHE_DIR)`'s own signature was
designed for — see [04-functions.md](04-functions.md) on default arguments —
the function accepts *any* `Path`, not hardcoded to `EMBEDDING_CACHE_DIR`,
specifically so a test can pass in an isolated directory instead of touching
the project's real cache.

**Testing `embed_texts` without spending real money.** `embed_texts` calls
`client.embeddings.create(...)`, which would hit the real OpenAI API (and
cost real tokens) if called during a test run. The standard fix is
**mocking** — replacing the real client with a fake stand-in that returns
canned data, using `unittest.mock` (standard library) or the `pytest-mock`
plugin:

```python
from unittest.mock import MagicMock
import numpy as np
from readnext import embed

def test_embed_texts_uses_cache(tmp_path, monkeypatch):
    fake_response = MagicMock()
    fake_response.data = [MagicMock(embedding=[0.1, 0.2, 0.3])]
    fake_response.usage.total_tokens = 5

    fake_client = MagicMock()
    fake_client.embeddings.create.return_value = fake_response
    monkeypatch.setattr(embed, "get_client", lambda: fake_client)

    result = embed.embed_texts(["hello"], cache_dir=tmp_path)

    assert result.shape == (1, 3)
    assert fake_client.embeddings.create.call_count == 1

    # second call for the same text should hit the cache, not the API again
    embed.embed_texts(["hello"], cache_dir=tmp_path)
    assert fake_client.embeddings.create.call_count == 1
```

**`monkeypatch`** is another built-in pytest fixture — it temporarily
replaces an attribute (here, `embed.get_client`) for the duration of one
test, automatically restoring the original afterward even if the test fails.
This is what lets the test swap in `fake_client` without permanently
altering `embed.py`.

**`MagicMock()`** creates an object that accepts any attribute access or
method call and returns another `MagicMock` by default — `fake_client.embeddings.create(...)`
works without you having defined `.embeddings` or `.create` anywhere,
because `MagicMock` auto-creates them on first access. Setting
`.return_value` pins what a specific call should return; `.call_count` lets
you assert *how many times* it was called — which is exactly the thing worth
testing here: that the second `embed_texts(["hello"], ...)` call reused the
`.npy` file on disk instead of calling the API again.

**Why this test design matters beyond "does it pass."** It directly verifies
the behavior the module's own docstring promises: *"The cache key is a hash
of the model id and the exact text — change either and you get a fresh
embedding, not a stale one."* A test asserting `call_count == 1` on the
second call is proof that promise actually holds, not just an assertion
about it in a comment.

**Where this would live.** Convention is a `tests/` directory (e.g.
`openai/read-next-project/tests/test_embed.py`) mirroring the package
structure, with `pytest` run from the project root — it auto-discovers files
matching `test_*.py` or `*_test.py` without needing to be told where they
are.
