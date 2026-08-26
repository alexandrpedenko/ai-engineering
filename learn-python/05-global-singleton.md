# The module-level cache pattern (`global`, lazy singletons)

From `embed.py`:

```python
_client: OpenAI | None = None


def get_client() -> OpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY not set — check the repo-root .env")
        _client = OpenAI(api_key=api_key)
    return _client
```

This is a well-known pattern called **lazy singleton initialization**: create
an expensive or stateful object (here, an `OpenAI` API client) only the first
time it's actually needed, then reuse that same object on every later call.

**Why it's needed.** `_client` is defined at module level (outside any
function), starting as `None`. Every function in Python gets its own local
namespace — if `get_client` just wrote `_client = OpenAI(...)` without the
`global` declaration, Python would treat `_client` as a brand-new *local*
variable inside `get_client`, shadowing the module-level one, and the
reassignment would vanish the moment the function returned. The `global
_client` line tells Python: "when I assign to `_client` in this function, I
mean the module-level name, not a local one." Reading a global's value never
requires this declaration — only rebinding it does.

**Why lazy, not eager?** If `_client = OpenAI(api_key=os.getenv(...))` ran at
*import time* (i.e., directly in `config.py` or at the top of `embed.py`),
just importing the module — even for something that never calls the API —
would fail if `OPENAI_API_KEY` isn't set yet, or would construct a client
nobody uses. Building it inside a function, on first use, means importing
`embed` is always safe, and the cost (and the error, if the key is missing)
only happens when you actually need to talk to OpenAI.

**The `if _client is None:` guard** is what makes it a *singleton* rather
than a fresh client every call: the second and all later calls to
`get_client()` skip straight to `return _client`, handing back the exact same
object.

**`os.getenv("OPENAI_API_KEY")`** reads an environment variable, returning
`None` if it isn't set (as opposed to `os.environ["OPENAI_API_KEY"]`, which
would raise `KeyError`). `if not api_key:` then catches both "not set" and
"set to an empty string," and raises a clear, actionable error instead of
letting the `OpenAI(...)` constructor fail later with a more confusing
message.

**Where you'll see this pattern again:** database connections, HTTP session
objects, loaded ML models — anything expensive to construct that a program
wants exactly one of, built on demand.
