# ADR-0003 — Dependencies reach nodes through `TripContext`

**Status:** Accepted (2026-10-04)

## Context

A node that builds its own chat model, or reads `hotels.json` itself, can
only be tested with a real model and real files. It also can't be pointed at
a cheaper model (book 10) or a different catalogue without editing it.
LangGraph passes a per-run context object to every node (`context_schema`,
`Runtime.context`) separately from the state, so it isn't checkpointed.

## Decision

Models (by role) and adapters (hotels, activities, transport, bookings) live
in a `TripContext` dataclass passed as the graph's context. Nodes take
everything they need from `runtime.context`. No module creates a chat model
or opens a data file at import time. `make_context()` builds the real one;
tests build their own with fakes.

## Consequences

- Any node can be tested with `GenericFakeChatModel` and an in-memory adapter
  (ADR-0006).
- The hotel agent's tools are built from the hotels adapter, not imported
  from `hotelbot.tools`, so they follow the same rule.
- State holds only data that should be saved and replayed; clients and
  connections are never checkpointed.

## Alternatives considered

- **Module-level `MODEL = init_chat_model(...)`.** Simple, untestable without
  patching.
- **Dependencies in state.** They would be serialised into every checkpoint.
