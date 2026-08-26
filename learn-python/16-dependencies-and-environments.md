# Dependency & environment management

**This repo's `Pipfile`:**

```toml
[[source]]
url = "https://pypi.org/simple"
verify_ssl = true
name = "pypi"

[packages]
pandas = "*"
openpyxl = "*"
pyyaml = "*"
anthropic = "*"
python-dotenv = "*"
ipywidgets = "*"
tiktoken = "*"
openai = "*"
numpy = "*"

[dev-packages]
ipykernel = "*"
nbconvert = "*"

[requires]
python_version = "3.14"
```

This is **Pipenv**'s dependency file — an alternative to the more common
`requirements.txt` / `pyproject.toml`. A few things worth understanding:

**Why not just `import numpy` and let it work?** Python doesn't ship NumPy,
OpenAI's client, or anything outside the standard library — those are
*third-party packages* that must be installed into your Python environment
before `import numpy as np` (see [01-modules-and-imports.md](01-modules-and-imports.md))
can succeed. The `Pipfile` is a declaration of *which* packages this project
needs, so anyone (including future you, on a different machine) can
reproduce the same environment with one command instead of guessing.

**`[packages]` vs `[dev-packages]`.** `[packages]` are needed to *run* the
project's code — `numpy` and `openai` are imported directly by `embed.py`.
`[dev-packages]` are only needed while *developing* — `ipykernel` (to run
Jupyter notebooks) and `nbconvert` (to execute/convert them) aren't imported
by any of this project's own source files; they're tooling around the
project, not dependencies of it.

**`"*"` as a version pin** means "any version" — Pipenv resolves an actual
exact version at install time and records it in `Pipfile.lock` (the second
file sitting next to `Pipfile` in this repo). This is the important
distinction:

- `Pipfile` — human-edited, loose version ranges, "what packages does this
  project need."
- `Pipfile.lock` — machine-generated, exact pinned versions + hashes,
  "reproduce *exactly* this environment." You commit both; you hand-edit
  only the first.

Pinning `"*"` everywhere (rather than e.g. `numpy = "^1.26"`) means this
project always installs the *latest* compatible version on a fresh
`pipenv install` — convenient for a learning/bootcamp repo where staying
current matters more than pinning for long-term stability, but it also means
"works on my machine" can drift over time as packages release new versions.

**`python_version = "3.14"`** pins the interpreter version itself — this is
what makes syntax like `X | None` (see [03-type-hints.md](03-type-hints.md))
and `list[str]` safe to use without `from __future__ import annotations`, in
projects targeting a new enough Python.

**Virtual environments — the "why" underneath all of this.** Every Python
project on your machine could need a different, possibly conflicting, set of
package versions (this project wants one `numpy`, another project might want
an older one). A **virtual environment** is an isolated Python installation +
package directory just for one project, so `pip install`/`pipenv install`
here never clashes with any other project's dependencies. `pipenv install`
creates and manages one automatically; `pipenv shell` (or `pipenv run ...`)
activates it so `python`/`import` resolve against that isolated set of
packages rather than whatever's installed globally. The `venv` module in the
standard library does the same isolation manually, without Pipenv's
dependency-locking on top:

```sh
python -m venv .venv
source .venv/bin/activate   # macOS/Linux
pip install numpy openai
```

**`.env` files and `python-dotenv`.** `python-dotenv` is in this `Pipfile`,
and `embed.py` reads a secret with:

```python
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise RuntimeError("OPENAI_API_KEY not set — check the repo-root .env")
```

`os.getenv` reads from the process's environment variables — but a plain
`.env` file sitting in the repo isn't automatically loaded into that
environment by Python itself. Something has to read the file and call
`os.environ[...] = value` for each line first — that's exactly what
`python-dotenv` does:

```python
from dotenv import load_dotenv
load_dotenv()   # reads .env in the current/parent directory, sets os.environ
```

This is typically called once, early (e.g. the first cell of a notebook, or
at import time in a project's entry point) — after that, every later
`os.getenv("OPENAI_API_KEY")` anywhere in the codebase, including deep inside
`embed.py`, just works. The pattern of keeping secrets in a `.env` file
(never committed — check for it in `.gitignore`) rather than hardcoded in
`config.py` is exactly why `config.py`'s docstring only talks about "paths,
model ids, and shared constants" — nothing secret lives there.
