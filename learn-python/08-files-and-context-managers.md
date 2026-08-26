# Files, `with`, and context managers

**The `with` statement**, from `embed.py`:

```python
with COST_LOG_FILE.open("a") as f:
    f.write(json.dumps(record) + "\n")
```

and

```python
with log_path.open() as f:
    return sum(json.loads(line)["cost_usd"] for line in f)
```

`with EXPR as NAME:` is Python's syntax for a **context manager** — an object
that defines "setup" and "guaranteed teardown" around a block of code. For an
open file, setup is opening it; teardown is closing it. The crucial part is
*guaranteed*: even if `f.write(...)` raised an exception partway through,
the file still gets closed when the `with` block exits, because the teardown
runs no matter how the block ends (normal completion, `return`, or
exception). Without `with`, you'd have to write:

```python
f = COST_LOG_FILE.open("a")
try:
    f.write(json.dumps(record) + "\n")
finally:
    f.close()
```

`with` is that `try`/`finally` pattern, packaged up. It works for any object
implementing the two special methods `__enter__` and `__exit__` — not just
files. Database connections, locks, and temporary directories commonly use
the same pattern.

**Two different truthy patterns for existence checks**, seen across
`embed.py`:

```python
if not log_path.exists():
    return 0.0
```

```python
if path.exists():
    vectors[i] = np.load(path)
else:
    to_fetch.append(i)
```

Both use `Path.exists()`, a boolean-returning method, directly in an `if`.
No need to compare `== True` — in Python, `if <expr>:` already treats the
expression as truthy/falsy.

**Guarding against a missing file before reading it**, from `total_cost`:

```python
def total_cost(log_path: Path = COST_LOG_FILE) -> float:
    """Sum of every logged run's cost, in USD."""
    if not log_path.exists():
        return 0.0
    with log_path.open() as f:
        return sum(json.loads(line)["cost_usd"] for line in f)
```

This early-return pattern — handle the "nothing to do" case first and return
immediately — avoids nesting the main logic inside an `if log_path.exists():`
block. It reads top-to-bottom as "if there's no log yet, the cost is zero;
otherwise, sum it up," which mirrors how you'd say it out loud.

**File mode strings**, seen in this file: `"a"` for append (create if
missing, write at the end), and the default mode (no argument to `.open()`)
which is `"r"` — read text. Other common modes: `"w"` (overwrite from
scratch — dangerous if you meant to append), `"rb"`/`"wb"` (binary, no text
decoding).
