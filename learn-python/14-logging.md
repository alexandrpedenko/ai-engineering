# Logging vs. print / hand-rolled logs

**This codebase hand-rolls its own log**, and does so deliberately — from
`embed.py`:

```python
def _log_cost(model: str, num_texts: int, num_cached: int, tokens: int) -> None:
    COST_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "model": model,
        "texts_requested": num_texts,
        "texts_cached": num_cached,
        "texts_embedded": num_texts - num_cached,
        "tokens": tokens,
        "cost_usd": tokens / 1_000_000 * EMBEDDING_PRICE_PER_1M_TOKENS,
    }
    with COST_LOG_FILE.open("a") as f:
        f.write(json.dumps(record) + "\n")
```

The module docstring explains why: *"Every call that actually reaches the
API appends one line to `COST_LOG_FILE`, so 'what did this notebook cost' is
always answerable from the log, not from memory."* This isn't "logging" in
the debugging sense (tracing what the program is doing) — it's a structured,
queryable *data* file. `total_cost` reads it back and sums a specific field.
That's the tell for reaching for plain JSONL + `json.dumps`/`json.loads`
instead of the stdlib `logging` module: the consumer isn't a human skimming
a text stream, it's code doing `sum(record["cost_usd"] for record in ...)`.

**`print()`** is the simplest option and is completely absent from this file
— worth noting *why not*. `print` always goes to stdout, has no severity
levels, no timestamps unless you add them by hand, and no way to turn it off
without editing the source. Fine for a quick one-off notebook check
(`print(cache_size())`), bad for anything meant to run repeatedly and leave
a durable trail.

**The stdlib `logging` module** sits between `print` and a hand-rolled data
log — it's the right tool when you want a human-readable trace of *what a
program did and when*, with severity levels and the ability to turn verbosity
up/down without touching the code:

```python
import logging

logger = logging.getLogger(__name__)

def embed_texts(texts, model=EMBEDDING_MODEL, ...):
    logger.info("embedding %d texts (%d cached)", len(texts), len(texts) - len(to_fetch))
    ...
    if to_fetch:
        logger.debug("calling %s for %d texts", model, len(to_fetch))
```

Key differences from `print`:

- **Levels** (`DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`) let you filter
  at runtime — `logging.basicConfig(level=logging.INFO)` silences `.debug()`
  calls without deleting them from the code.
- **`logger.info("...%s...", value)`** takes the value as a separate
  argument rather than an f-string — the string is only formatted if that
  log level is actually enabled, which matters when logging is
  performance-sensitive (an f-string like `f"...{expensive_call()}..."`
  always runs `expensive_call()`, even if the log line gets filtered out).
- **`__name__`** (used in `logging.getLogger(__name__)`) is a special
  variable every module has automatically — it's the module's dotted import
  path (e.g. `"readnext.embed"`), so log output can show exactly which
  module produced each line without you typing it manually.

**When to pick which, as a rule of thumb:**

| Need | Tool |
|---|---|
| Quick check while writing a notebook cell | `print` |
| "What is this program doing right now" trace, filterable by severity | `logging` |
| Structured records meant to be read back and computed on later (costs, metrics, audit trail) | hand-rolled JSONL, as `_log_cost` does |

`_log_cost` chose correctly for its job: `total_cost()` needs to compute a
sum over structured fields, which `logging`'s free-text log lines don't give
you without extra parsing.
