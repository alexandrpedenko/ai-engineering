# ADR-0006 — `tests/` never call a real model

**Status:** Accepted (2026-10-04)

## Context

Project 1 checked behaviour by running notebooks against the real model:
slow, paid, and the answer varies between runs. The shop-assistant project
showed the other way — enforcement testable with no model in the loop.

## Decision

Everything under `tests/` runs with no API key: domain functions directly,
nodes and graphs with `GenericFakeChatModel` (scripted responses, including
tool calls) and in-memory adapters through `TripContext` (ADR-0003). Checks
that need a real model — is this plan sensible, did the prompt change help —
live in `evals/` and run against LangSmith datasets (books 12–13).

## Consequences

- `pytest` is fast and free, so it runs after every slice.
- Each book's "done when" names the test that proves the graph-level
  behaviour (routing, loop guard, interrupt, idempotency).
- The fake model must be scripted per test; that script is part of what
  the test documents.
- `GenericFakeChatModel` (langchain-core 1.6.4) raises `NotImplementedError`
  on `bind_tools` and `with_structured_output`. `tripgraph/testing.py` holds
  `ScriptedModel`, a subclass that returns itself from `bind_tools` and
  turns the next scripted tool call into the schema for
  `with_structured_output`. Checked on 2026-10-04: it drives a
  `ToolNode` / `tools_condition` loop to the end. It lives in the package,
  not in `tests/`, so project 3 can reuse it.

## Alternatives considered

- **Record real responses and replay them (VCR-style).** Brittle when the
  prompt changes, and hides what the test depends on.
