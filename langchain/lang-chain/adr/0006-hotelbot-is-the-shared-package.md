# ADR-0006 — `hotelbot/` is the shared package

**Status:** Accepted (2026-09-13)

## Context

Projects 2 (LangGraph) and 3 (Deep Agents) use the same domain so they can
spend their cells on what is new to them. That only works if the tools and
data they import don't move under them.

## Decision

`hotelbot/tools.py`, `hotelbot/models.py` and `data/` are contracts once a
book that introduces them is built: signatures and JSON shapes listed in
`spec.md` change only through a new ADR. Projects 2 and 3 import
`hotelbot` (path added in their notebooks) and never copy it.

Agent construction (`hotelbot/agent.py`), prompts and middleware are this
project's own and may be reworked freely.

## Consequences

- Tool docstrings are written for a model, once, and reused three times —
  worth getting right in book 2.
- Tools return plain dicts/strings (model-readable), while `catalogue.py`
  returns Pydantic objects (code-readable). Two layers, on purpose.
- A later project that needs a new tool adds it here, in a new ADR, rather
  than forking.

## Alternatives considered

- **Each project self-contained.** Three copies of `search_hotels`, drifting.
