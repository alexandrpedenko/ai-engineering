# Dicts, f-strings, and JSON

**Building a dict literal**, from `_log_cost` in `embed.py`:

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

`{key: value, ...}` is a dict literal — an unordered (well, insertion-ordered
since Python 3.7) mapping from keys to values. Note the values can be
computed expressions, not just plain variables: `num_texts - num_cached` and
a full arithmetic expression for `cost_usd`.

**`1_000_000`** — the underscore is a *digit separator*, purely for human
readability. Python ignores it entirely; `1_000_000 == 1000000` is `True`.
Handy for large literal numbers so you can count zeros correctly.

**f-strings are notably absent here** — the code builds a dict and then
serializes it with `json.dumps`, rather than manually formatting a string.
But f-strings do appear elsewhere in this codebase, e.g. in `_cache_key`:

```python
def _cache_key(text: str, model: str) -> str:
    return hashlib.sha256(f"{model}:{text}".encode()).hexdigest()
```

`f"{model}:{text}"` is an f-string (formatted string literal) — the `f`
prefix means anything inside `{}` is evaluated as a Python expression and
substituted in. So if `model = "text-embedding-3-small"` and
`text = "hello"`, this produces the string `"text-embedding-3-small:hello"`.
This is the modern replacement for older styles like
`"{}:{}".format(model, text)` or `"%s:%s" % (model, text)`.

**Why hash `f"{model}:{text}"` instead of just `text`?** So that the same
text embedded with two different models gets two different cache entries —
if the code only hashed `text`, switching `EMBEDDING_MODEL` in `config.py`
would silently return stale embeddings from the wrong model.

**`.encode()`** turns a Python `str` (text) into `bytes`, because
`hashlib.sha256` operates on bytes, not text — this is the boundary between
"human-readable string" and "raw bytes," and you'll hit it anywhere hashing,
encryption, or low-level I/O is involved.

**JSON serialization**, from `_log_cost`:

```python
with COST_LOG_FILE.open("a") as f:
    f.write(json.dumps(record) + "\n")
```

`json.dumps(record)` converts the Python dict `record` into a JSON-formatted
string. Writing one JSON object per line, rather than one big JSON array, is
a format called **JSON Lines** (`.jsonl`) — you'll see it in `PAPERS_FILE`
and `GOLDEN_FILE` in `config.py` too. Its advantage over a single big JSON
array: you can append a new line to the file cheaply (as done here) without
reading and rewriting the whole file, and you can read the log back one
record at a time.

Reading it back, from `total_cost`:

```python
with log_path.open() as f:
    return sum(json.loads(line)["cost_usd"] for line in f)
```

Iterating over an open file (`for line in f`) yields one line at a time.
`json.loads(line)` parses each line's JSON text back into a Python dict, and
`["cost_usd"]` looks up that one field. `sum(... for line in f)` is a
**generator expression** — like a list comprehension but without the square
brackets, producing values one at a time instead of building a full list in
memory first. For a log file with many lines, this avoids holding the whole
parsed file in memory just to add up one field.
