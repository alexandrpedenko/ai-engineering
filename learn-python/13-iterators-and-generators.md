# Iterators & generators

**You've already used the protocol without naming it.** From `total_cost` in
`embed.py`:

```python
with log_path.open() as f:
    return sum(json.loads(line)["cost_usd"] for line in f)
```

`for line in f` works because an open file object is an **iterator** — it
implements `__iter__` and `__next__`, and each call to `__next__` reads and
returns the next line, raising `StopIteration` when there's nothing left
(which a `for` loop catches automatically to know when to stop). Crucially,
the file is *not* read into memory all at once — each line is produced on
demand, as the loop asks for it.

**`json.loads(line)["cost_usd"] for line in f` is a generator expression**,
not a list comprehension — no square brackets. It builds a *generator*, a
lazy iterator that computes each value only when asked. `sum(...)` asks for
one value, adds it, asks for the next, and so on, never holding more than one
parsed line in memory at once. If this had been written
`sum([json.loads(line)["cost_usd"] for line in f])` (with brackets), Python
would first build the *entire list* of every cost value, then sum it — for a
huge log file, that's a real, avoidable memory cost.

**Writing your own generator function**, using `yield`. Nothing in this
codebase defines one, but it's the natural next step if `embed_texts` needed
to process an enormous list of texts without holding all the input in memory
at once:

```python
def read_cost_log(log_path: Path = COST_LOG_FILE):
    """Yield each cost-log record as a dict, one at a time."""
    with log_path.open() as f:
        for line in f:
            yield json.loads(line)
```

Calling `read_cost_log()` doesn't run any of this code immediately — it
returns a generator object. Only when something iterates over it (a `for`
loop, `list(...)`, `sum(...)`) does the function body actually start
running, pausing at each `yield` to hand back one value, then resuming from
exactly that point on the next request. This is why `total_cost` could be
rewritten as:

```python
def total_cost(log_path: Path = COST_LOG_FILE) -> float:
    if not log_path.exists():
        return 0.0
    return sum(record["cost_usd"] for record in read_cost_log(log_path))
```

— same laziness, same memory behavior, but the "how do I read this log file"
logic is now reusable instead of duplicated wherever you need cost records.

**The general shape.** Any function containing `yield` anywhere in its body
becomes a generator function — calling it never runs the body directly, it
always returns a generator. This is the same mechanism, generalized, behind
`range(...)` (used in `embed_texts`'s batching loop — see
[04-functions.md](04-functions.md)): `range(0, len(to_fetch), batch_size)`
doesn't build a list of every index up front, it produces them lazily as the
`for` loop asks.

**Why this matters for embeddings specifically.** `embed_texts` currently
takes `texts: list[str]` — a fully materialized list, all in memory before
the function even starts. For a corpus of a few thousand paper abstracts
(this project's actual scale — see `ARXIV_TARGET_COUNT = 2000` in
`config.py`), that's completely fine. For a corpus in the millions, you'd
want the input itself to be a generator (e.g. reading `PAPERS_FILE` line by
line rather than `json.load`-ing the whole thing into one list first) so the
program's memory usage doesn't scale with corpus size.
