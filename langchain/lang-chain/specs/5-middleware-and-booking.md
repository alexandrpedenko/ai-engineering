# Book 5 — middleware and booking

**Status:** draft
**Decides:** ADR-0004 (no reservation without approval)

## What you can do after this that you couldn't before

Have a conversation instead of a sequence of unrelated calls, let the agent
book a room — and see it stop and wait for your yes before anything is
written. Along the way: the hook points where code can step into the loop,
which is how the approval gate, conversation compression and a tool-call
logger all work.

## Builds on

Book 3's `build_agent()` / `run()` and the `middleware` / `checkpointer`
arguments that have been sitting unused. Book 4's `lookup_policy`.

This is the largest book. If it runs long in building, the natural split is
after cell 7 (memory + booking + approval) with summarisation and the custom
hook in a `5b`.

## Module contracts

`data/reservations.json` — `[]` committed; gitignored after that (ADR-0002).

`hotelbot/models.py` — adds `Reservation` (shape in `spec.md`).

`hotelbot/reservations.py` — the only code that writes the file:

```python
load_reservations() -> list[Reservation]
add_reservation(hotel_id, guest, check_in, check_out) -> Reservation   # checks availability, assigns res-NNNN
reset_reservations() -> None                                            # back to []
```

`hotelbot/tools.py` — adds:

```python
make_reservation(hotel_id, guest, check_in, check_out) -> dict   # Reservation.model_dump()
```

Its docstring says it *books* — the tool itself does not ask for
confirmation and must not claim to.

`hotelbot/middleware.py`

```python
class LogToolCalls(AgentMiddleware)   # wrap_tool_call: print name + args before, size of result after
```

`hotelbot/agent.py` — `build_agent` now:

- always includes `HumanInTheLoopMiddleware(interrupt_on={"make_reservation": True})`
  first in the stack, regardless of the `middleware` argument (ADR-0004);
- adds `make_reservation` to the tools;
- defaults `checkpointer` to `InMemorySaver()` when `None`, because an
  interrupt cannot resume without one.

`run` returns `AgentResult` with a new field `interrupt: dict | None`, filled
from `result["__interrupt__"]` when the run paused. Adds:

```python
def resume(agent, decision, thread_id="default") -> AgentResult
# decision: {"type": "approve"} | {"type": "edit", "args": {...}} | {"type": "reject", "message": "..."}
```

## Notebook outline

| # | kind | idea |
| --- | --- | --- |
| 0 | md | title — the agent answers one message at a time and can't book; this book gives it a memory of the conversation and a pen, and puts a hand on the pen |
| 1 | code | `configure_tracing(5)`, `reset_reservations()`, `build_agent()` |
| 2 | md/code | **Memory is a checkpointer.** Book 3's agent, two turns: "two nights in Alfama 10–12 Oct under €150", then "is the second one free a day later?" — predict: does it know what "the second one" is? Now `build_agent(checkpointer=InMemorySaver())` with one `thread_id` — it does. Same two turns with two different `thread_id`s — it doesn't. The list from book 1 cell 5 is now stored per thread instead of resent by you. |
| 3 | md/code | **The write.** `add_reservation("lis-004", "olek", "2026-10-10", "2026-10-12")` as plain Python; `cat data/reservations.json`; `reset_reservations()`. Then `make_reservation` as a tool — `.description` says it books. |
| 4 | md/code | **What a model does with a pen.** Build `create_agent` directly in the cell with `make_reservation` and no middleware. Ask "what would two nights at Casa do Castelo 10–12 Oct cost?" — predict: does it book? Run it three times; `load_reservations()`. At least one run wrote a reservation for a question that never asked for one. |
| 5 | md/code | **The loop has hooks.** A middleware is a class with methods the loop calls at fixed points: `before_model`, `after_model`, `wrap_tool_call`. Draw the loop from book 2 with those three points marked. No code yet — one cell to name the mechanism the next three cells use. |
| 6 | md/code | **The approval gate.** `build_agent()` (which adds `HumanInTheLoopMiddleware` itself); "book Casa do Castelo 10–12 Oct for olek". `result.interrupt` holds the action request: tool name and the exact args about to run. `reservations.json` is still empty. The trace shows the run parked before the tool node. |
| 7 | md/code | **Resume: approve, edit, reject.** `resume(agent, {"type": "approve"})` — the file has one entry. Reset; same request; `{"type": "edit", "args": {..., "check_out": "2026-10-13"}}` — three nights booked, the model's args replaced by yours. Reset; `{"type": "reject", "message": "not that one"}` — nothing written, the model gets the message and replies. |
| 8 | md/code | **Long conversations get summarised.** `SummarizationMiddleware(model=CHEAP_MODEL, trigger=("tokens", N))` with N small enough to fire in ten turns; loop ten short hotel questions on one thread; print the message list — the first turns have been replaced by one summary message; token count per call from `usage_metadata` drops at the point it fired. Then ask about something from turn 2 and see whether the summary kept it. |
| 9 | md/code | **Your own hook.** `LogToolCalls` — `wrap_tool_call` prints the tool name and args, calls `handler(request)`, prints the result size. `build_agent(middleware=[LogToolCalls()])`; one booking; the log shows the order of tool calls, and the approval gate still fires — the ADR-0004 middleware is there whatever you pass. |
| 10 | md | closing — the agent holds a conversation, books, and can't book without you. Every book so far used one bare prompt; book 6 makes that prompt earn its place. |

## Done when

- Cell 2: same thread remembers, different thread doesn't.
- Cell 4 writes at least one reservation in three runs with no middleware —
  the failure is real, not hypothetical.
- Cell 6 leaves `reservations.json` empty; cell 7's approve writes exactly
  one entry, edit writes the edited dates, reject writes nothing.
- Cell 8 shows a summary message in the state and a token drop.
- `build_agent(middleware=[LogToolCalls()])` still interrupts on booking.

## Not in this book

Long-term memory across threads (project 3). Persistent checkpointers
(`SqliteSaver`) — in-memory is enough to show the mechanism. Retries, tool
errors, screening what tools return (book 7). Prompt wording (book 6).
