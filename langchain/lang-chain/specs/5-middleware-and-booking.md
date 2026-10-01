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

## Module contracts

`data/reservations.json` — not committed, and gitignored like `data/chroma/`.
A missing file reads as `[]`, so a fresh clone needs no setup step.

`hotelbot/models.py` — adds `Reservation` (shape in `spec.md`).

`hotelbot/reservations.py` — the only code that writes the file:

```python
load_reservations() -> list[Reservation]          # [] if the file doesn't exist
add_reservation(hotel_id, guest, check_in, check_out) -> Reservation
reset_reservations() -> None                      # back to []
```

`add_reservation` checks the stay with `catalogue.check_availability`, raises
`ValueError(reason)` if it isn't ok, assigns the next `res-NNNN` id, and
appends. It does not check overlap with earlier reservations — the catalogue
doesn't model room counts.

`hotelbot/tools.py` — adds:

```python
make_reservation(hotel_id, guest, check_in, check_out) -> dict
# Reservation.model_dump() on success, {"error": reason} when the stay isn't available; never raises
```

Its docstring says it *books* — the tool itself does not ask for
confirmation and must not claim to.

`hotelbot/middleware.py`

```python
class LogToolCalls(AgentMiddleware)   # wrap_tool_call: print name + args before, size of result after
```

`hotelbot/agent.py` — `build_agent` now:

- defaults `checkpointer` to `InMemorySaver()` when `None`, because an
  interrupt cannot resume without one (slice 1);
- always includes `HumanInTheLoopMiddleware(interrupt_on={"make_reservation": True})`
  first in the stack, regardless of the `middleware` argument (ADR-0004), and
  adds `make_reservation` to the tools (slice 3 — the tool is not in
  `build_agent` before the gate exists).

`run(agent, text, thread_id=None)` — `None` means a fresh thread id per call.
With a default checkpointer, a fixed `"default"` thread would silently turn
every `run()` in a notebook (books 3 and 4 included) into one long
conversation; memory has to be asked for by passing the same `thread_id`.

`run` returns `AgentResult` with a new field `interrupt: dict | None` — the
`HITLRequest` value from `result["__interrupt__"]` when the run paused — and
a `thread_id` field so the caller can resume the right thread. Adds:

```python
def resume(agent, decision, thread_id) -> AgentResult
# decision is langchain's own shape, passed through unchanged:
# {"type": "approve"}
# {"type": "edit", "edited_action": {"name": "make_reservation", "args": {...}}}
# {"type": "reject", "message": "..."}
```

## Notebook outline

| # | kind | idea |
| --- | --- | --- |
| 0 | md | title — the agent answers one message at a time and can't book; this book gives it a memory of the conversation and a pen, and puts a hand on the pen |
| 1 | code | `configure_tracing(5)`, `build_agent()`; slice 2 adds `reset_reservations()` |
| 2 | md/code | **Each call starts blank.** Two `run()` calls with no `thread_id`: "two nights in Alfama 10–12 Oct under €150", then "is the second one free a day later?" Predict: does it know what "the second one" is? It doesn't — each call is a fresh thread. |
| 3 | md/code | **Memory is a checkpointer.** `build_agent()` already carries an `InMemorySaver` (print `agent.checkpointer`); the same two turns with one `thread_id` — now it knows. Print the thread's message list: the list you built by hand in book 1, now stored per thread instead of resent by you. |
| 4 | md/code | **The write.** `add_reservation("lis-004", "olek", "2026-10-10", "2026-10-12")` as plain Python; print `data/reservations.json`; `reset_reservations()`. Then `make_reservation` as a tool — `.description` says it books. |
| 5 | md/code | **What a model does with a pen.** Build `create_agent` directly in the cell with `build_agent`'s tools plus `make_reservation`, no middleware. Two messages, three runs each, counting `load_reservations()` after each: a price question ("Casa do Castelo 10–12 Oct for olek looks good — what would that come to?") and a booking with vague dates ("the second weekend of October"). The price question is left to the model's judgement; the vague booking writes reservations with dates nobody confirmed. |
| 6 | md | **The loop has hooks.** A middleware is a class with methods the loop calls at fixed points: `before_model`, `after_model`, `wrap_tool_call`. Book 2's loop drawn as text with those three points marked. No code — one cell to name the mechanism the next cells use. |
| 7 | md/code | **The approval gate.** `build_agent()` (which adds `HumanInTheLoopMiddleware` itself); "book Casa do Castelo 10–12 Oct for olek". `outcome.interrupt` holds the action request: tool name and the exact args about to run. `load_reservations()` is still empty. |
| 8 | md/code | **Approve.** `resume(agent, {"type": "approve"}, thread_id)` — the file has one entry. |
| 9 | md/code | **Edit.** Reset; same request; an edit decision with `check_out` moved to `2026-10-13` — three nights booked, the model's args replaced by yours. |
| 10 | md/code | **Reject.** Reset; same request; `{"type": "reject", "message": "not that one"}` — nothing written, the model gets the message and replies. |
| 11 | md/code | **Long conversations get summarised.** Tokens defined. `SummarizationMiddleware(model=CHEAP_MODEL, trigger=("tokens", 5500), keep=("messages", 6))`; ten questions on one thread, four of them pulling a city's full hotel list; each turn prints the message count and the last call's reported `total_tokens`. The trigger also reads that reported total, which includes the system prompt and tool descriptions (~2,500 tokens). Fires around turn 7: messages and tokens both drop. |
| 12 | md/code | **What the summary kept.** Print the summary message; ask for the dog's name and budget from turn 2 on the same thread. |
| 13 | md/code | **Your own hook.** `LogToolCalls` (source printed) — `wrap_tool_call` prints the tool name and args, calls `handler(request)`, prints the result size. `build_agent(middleware=[LogToolCalls()])`; one booking; `make_reservation` appears in the log only after approval — the ADR-0004 gate is there whatever you pass. |
| 14 | md | closing — the agent holds a conversation, books, and can't book without you. Every book so far used one bare prompt; book 6 compares versions of it. |

## Done when

- Cell 2: separate calls don't remember; cell 3: one thread does.
- Cell 5's markdown holds whether or not the price question books; the
  vague booking writes reservations with dates the model picked.
- Cell 7 leaves `reservations.json` empty; cell 8's approve writes exactly
  one entry, cell 9's edit writes the edited dates, cell 10's reject writes
  nothing.
- Cell 11 shows a summary message in the state and a drop in messages and tokens; cell 12 shows what survived it.
- `build_agent(middleware=[LogToolCalls()])` still interrupts on booking.
- Books 3 and 4 still run unchanged against the new `build_agent` / `run`.

## Not in this book

Long-term memory across threads (project 3). Persistent checkpointers
(`SqliteSaver`) — in-memory is enough to show the mechanism. Retries, tool
errors, screening what tools return (book 7). Prompt wording (book 6).
