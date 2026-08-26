# Exceptions & error handling

**Raising an exception**, from `embed.py`:

```python
def get_client() -> OpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY not set — check the repo-root .env")
        _client = OpenAI(api_key=api_key)
    return _client
```

`raise` immediately stops normal execution and starts unwinding the call
stack, looking for something that handles this exception type. `RuntimeError`
is one of Python's built-in exception classes — a general-purpose "something
is wrong that isn't captured by a more specific built-in exception" error.
Notice there's no `try`/`except` here: this code deliberately lets the error
propagate all the way up and crash whatever called `get_client()`. That's the
right call when there's no sensible way to recover — a notebook that can't
reach the OpenAI API has no fallback path, so failing loud and immediately,
with a message that says exactly what to fix, beats limping along.

**Why the message matters.** `"OPENAI_API_KEY not set — check the repo-root .env"`
tells you *what's wrong* and *where to look*, not just that something failed.
Compare to the unhelpful alternative of letting `OpenAI(api_key=None)`
construct successfully and fail later, deep inside an HTTP call with a
generic "401 Unauthorized" — by then you've lost the context of *why*.

**When you *would* reach for `try`/`except`**, not present in this codebase
but a natural next step for `embed_texts`'s API call:

```python
response = client.embeddings.create(input=batch_texts, model=model)
```

If this call can fail transiently (rate limits, network blips), you might
wrap it:

```python
try:
    response = client.embeddings.create(input=batch_texts, model=model)
except RateLimitError:
    time.sleep(5)
    response = client.embeddings.create(input=batch_texts, model=model)
```

The rule of thumb: only catch exceptions you have a specific, useful response
to. Catching bare `except:` (or `except Exception:`) and silently continuing
is a well-known anti-pattern — it swallows real bugs (a typo'd variable name
throwing `NameError` looks identical to a network timeout) and makes
debugging much harder. Catch the *specific* exception type you expect and
know how to handle.

**Custom exceptions.** When built-ins (`ValueError`, `RuntimeError`,
`KeyError`, `TypeError`, ...) don't capture the *kind* of failure clearly
enough, define your own by subclassing `Exception`:

```python
class EmbeddingCacheError(Exception):
    """Raised when the on-disk embedding cache is corrupted or unreadable."""

def embed_texts(...):
    ...
    try:
        vectors[i] = np.load(path)
    except (OSError, ValueError) as e:
        raise EmbeddingCacheError(f"corrupt cache file {path}") from e
```

`raise ... from e` chains the new exception to the original one — the
traceback shows both "here's the new, more specific error" and "here's the
original low-level error that caused it," rather than losing the original
context.

**`finally` vs. `with`.** You *could* write manual cleanup with
`try`/`finally`:

```python
f = COST_LOG_FILE.open("a")
try:
    f.write(json.dumps(record) + "\n")
finally:
    f.close()
```

but as [08-files-and-context-managers.md](08-files-and-context-managers.md)
covers, `with COST_LOG_FILE.open("a") as f:` is exactly this pattern,
packaged so you can't forget the `finally`.

**Exceptions are control flow, not just errors.** `if not log_path.exists():
return 0.0` in `total_cost` (see
[08-files-and-context-managers.md](08-files-and-context-managers.md)) checks
*before* acting to avoid an exception entirely — this is called LBYL ("look
before you leap"). Python culture often prefers the opposite, EAFP ("easier
to ask forgiveness than permission"): just try the operation and catch the
exception if it fails, e.g. `try: f = log_path.open() except FileNotFoundError: return 0.0`.
Both are valid; LBYL reads more clearly when the check is cheap and there's
no race condition risk (as here — nothing else is deleting `log_path`
concurrently), while EAFP tends to win when the check itself would duplicate
work the operation already has to do.
