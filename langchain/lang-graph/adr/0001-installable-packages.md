# ADR-0001 — `hotelbot` and `tripgraph` are installable packages

**Status:** Proposed (2026-10-04)

## Context

Project 1's ADR-0006 says projects 2 and 3 import `hotelbot` "with the path
added in their notebooks". That works for a notebook, but not for
`python -m tripgraph` started from any directory, for `pytest`, for
`langgraph dev` (book 11), or for project 3 importing `tripgraph`. Each of
them would need its own `sys.path` edit, and they drift.

## Decision

`langchain/lang-chain/pyproject.toml` and `langchain/lang-graph/pyproject.toml`
make `hotelbot` and `tripgraph` packages. Both are installed into the
repo's Pipfile environment as editable path installs. Nothing in either
project edits `sys.path`. Data paths keep resolving from each module's own
file (`hotelbot.config.PROJECT_ROOT`), so they work wherever the process
starts.

## Consequences

- Book 1's first slice adds the two `pyproject.toml` files and the Pipfile
  entries; project 1's notebooks keep working (their own directory is still
  on the path).
- Adding `pyproject.toml` to project 1 is packaging only — no `hotelbot`
  signature changes, so P1's ADR-0006 holds.
- Project 3 does the same for `concierge`.

## Alternatives considered

- **`sys.path.insert` in each notebook and in `__main__.py`.** Works until
  the second entry point; then there are several copies of the same hack.
- **A `PYTHONPATH` in `.env`.** Invisible, and `langgraph dev` and pytest
  don't read it the same way.
