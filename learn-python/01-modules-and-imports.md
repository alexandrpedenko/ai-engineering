# Modules & imports

**The file as a module.** Every `.py` file is a *module* — a namespace Python
builds by running the file top to bottom once. `config.py` is a module full of
constants; `embed.py` is a module full of functions. Nothing here forces them
to be classes — a module is already an object other code can reach into with
dot notation (`config.EMBEDDING_MODEL`).

**A docstring as the very first statement** becomes the module's documentation,
retrievable at runtime as `config.__doc__`:

```python
"""Paths, model ids, and shared constants.

Pinned here so a model rename or a path change is a one-line edit instead of a
grep across notebooks.
"""
```

Same idea at the top of `embed.py`. This isn't a comment (`#`) — it's a string
literal that Python specifically recognizes as documentation when it's the
first thing in a file, class, or function body.

**Standard library imports**, from `embed.py`:

```python
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
```

- `import hashlib` binds the whole module under the name `hashlib`; you reach
  its contents as `hashlib.sha256(...)`.
- `from datetime import datetime, timezone` instead pulls specific names out
  of the `datetime` module directly into this file's namespace, so you write
  `datetime.now(timezone.utc)` rather than `datetime.datetime.now(...)`.
  (Confusingly, the module is called `datetime` *and* it contains a class
  called `datetime` — this is a real wart in the standard library.)

**Third-party imports:**

```python
import numpy as np
from openai import OpenAI
```

`import numpy as np` is an *alias* — `np` is just a shorter local name for the
same module object. This is a convention so strong in the data/ML world
(`np` for numpy, `pd` for pandas) that deviating from it will confuse other
readers for no benefit.

**Importing from a sibling file in the same package**, from `embed.py`:

```python
from .config import (
    COST_LOG_FILE,
    EMBEDDING_BATCH_SIZE,
    EMBEDDING_CACHE_DIR,
    EMBEDDING_MODEL,
    EMBEDDING_PRICE_PER_1M_TOKENS,
)
```

The leading `.` means "relative to this package" — `config.py` lives next to
`embed.py` inside the `readnext/` directory, which is a *package* because it
has an `__init__.py`. Parenthesizing the import list is just a way to spread
a long `from x import a, b, c` across multiple lines legally; the parens have
no other meaning here (they're not a tuple).

**Why bother with a `config.py` at all?** The module docstring says it
outright: constants that might change (a model id, a price, a directory
layout) live in exactly one place, so updating them is a one-line edit
instead of hunting through every notebook that used the old value. This is a
very common pattern — look for a `config.py`, `settings.py`, or `constants.py`
in most nontrivial Python projects.
