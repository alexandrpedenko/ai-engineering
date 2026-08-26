# pathlib: paths as objects

Older Python code (and a lot of tutorials) build file paths with string
concatenation: `os.path.join(root, "data", "papers.jsonl")`. This codebase
uses `pathlib.Path` instead, which treats a filesystem path as an object with
useful methods rather than a plain string to glue together.

From `config.py`:

```python
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
INDEX_DIR = DATA_DIR / "index"
SESSIONS_DIR = DATA_DIR / "sessions"

PAPERS_FILE = DATA_DIR / "papers.jsonl"
```

**`__file__`** is a special variable Python fills in automatically for every
module: the path to the file currently being executed (here, `config.py`
itself). So `Path(__file__)` is "the path to this very file."

**`.resolve()`** turns a possibly-relative path into an absolute, canonical
one (resolving `..` segments and symlinks).

**`.parent`** walks up one directory. Chaining it twice —
`.parent.parent` — walks up two levels: from `config.py`, up to `readnext/`,
up to `read-next-project/`. That's `PROJECT_ROOT`.

**The `/` operator is overloaded.** `DATA_DIR / "index"` doesn't mean
division here — `Path` defines `__truediv__` (see
[10-decorators.md](10-decorators.md) for more on these dunder/magic methods)
so that `/` joins path components in an OS-correct way. On Windows this
produces backslashes; on macOS/Linux, forward slashes — you never have to
think about the separator yourself. Compare to the old way:
`os.path.join(str(DATA_DIR), "index")`. The `Path` version reads closer to
how you'd say it out loud.

**Paths chain.** `INDEX_DIR = DATA_DIR / "index"` and then, elsewhere,
`EMBEDDING_CACHE_DIR = INDEX_DIR / "embedding_cache"` — each new path is built
from the previous one, so if `DATA_DIR` ever moved, every path derived from it
moves too, automatically, since they're computed once at import time from
`PROJECT_ROOT`.

**Using a `Path` for I/O**, from `embed.py`:

```python
COST_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
...
with COST_LOG_FILE.open("a") as f:
    f.write(json.dumps(record) + "\n")
```

- `.mkdir(parents=True, exist_ok=True)` creates the directory (and any
  missing parent directories, thanks to `parents=True`) without raising an
  error if it's already there (`exist_ok=True`). Without `exist_ok=True`,
  calling `mkdir()` on an existing directory raises `FileExistsError`.
- `.open("a")` is equivalent to the builtin `open(path, "a")` — `"a"` means
  *append*: write to the end of the file, creating it if it doesn't exist.
- `Path` objects also expose `.exists()`, `.glob(pattern)`, `.name`,
  `.suffix`, `.stem`, and more — see `cache_size()` in `embed.py`, which uses
  `cache_dir.glob("*.npy")` to iterate over cached embedding files.
