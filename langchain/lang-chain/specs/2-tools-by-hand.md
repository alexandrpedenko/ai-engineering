# Book 2 — tools by hand

**Status:** draft
**Decides:** ADR-0002 (local JSON, fixed dates), ADR-0003 (the loop is written out once), ADR-0006 (tool signatures are contracts)

## What you can do after this that you couldn't before

Give the model a function. Turn a Python function into a tool the model can
see, watch the model ask for it instead of inventing an answer, run the call
yourself, hand the result back, and repeat until the model has nothing more
to ask for. That repeat is the agent loop; this book writes it out in six
lines so book 3's `create_agent` is a library call and not a mystery.

## Builds on

Book 1: `init_chat_model`, `HumanMessage` / `AIMessage`, the fact that a
conversation is a list you resend. Cell 4 of book 1 — the invented Alfama
hotel — is the problem this book solves.

## Module contracts

`data/hotels.json` — ~40 hotels, ~10 per city across Lisbon, Porto, Madrid,
Seville, in the shape given in `spec.md`. Deliberately includes: two hotels in
Alfama under €150 (so book 1's question has a real answer), one hotel whose
`available` ranges have a gap in October (so a stay that straddles the gap is
refused), and a price spread wide enough that `max_price` filters visibly.

`hotelbot/catalogue.py` — pure functions over the file, return Pydantic:

```python
load_hotels() -> list[Hotel]
search_hotels(city, max_price=None, amenities=None, district=None) -> list[Hotel]
get_hotel(hotel_id) -> Hotel | None
check_availability(hotel_id, check_in, check_out) -> Availability
```

`check_availability` is the only place with date logic: `nights` is the
difference of the two ISO dates, `total = nights * price_per_night`, and `ok`
is true only when `[check_in, check_out)` sits inside one `available` range.
Unknown hotel, `check_out <= check_in`, or no range containing the stay all
return `ok=False` with a one-line `reason` — never raise.

`hotelbot/models.py` — adds:

```python
class Availability(BaseModel)   # ok: bool, nights: int, total: float, reason: str | None
```

`hotelbot/tools.py` — the same three names, decorated with `@tool`, returning
plain dicts (`model_dump()`) so the model reads JSON, not a Pydantic repr.
The docstrings are written for the model and are the contract: what the
function does, what each argument means, what the caller gets back, what it
ignores (e.g. `search_hotels` does not check dates — that's
`check_availability`).

```python
search_hotels, get_hotel, check_availability
```

Not yet in `tools.py`: `lookup_policy` (book 4), `make_reservation` (book 5).
No `agent.py` yet.

## Notebook outline

| # | kind | idea |
| --- | --- | --- |
| 0 | md | title — book 1 ended with the model inventing a hotel; the fix is not a better prompt but a function it can ask you to run |
| 1 | code | `configure_tracing(2)`, `init_chat_model(CHAT_MODEL)`, `load_hotels()` — print the count and one record |
| 2 | md/code | **The catalogue is plain Python.** `search_hotels("Lisbon", max_price=150, district="Alfama")` and `check_availability("lis-004", "2026-10-10", "2026-10-12")` as ordinary function calls; predict `nights` and `total` before running. Then a stay that straddles the October gap — predict `ok`. Nothing here involves a model. |
| 3 | md/code | **A tool is a function plus a description.** `@tool` on `search_hotels`; print `.name`, `.description`, `.args`. The `args` schema came from the type hints, the description from the docstring — that text is all the model will ever see of the function. |
| 4 | md/code | **Binding.** `model_with_tools = model.bind_tools([search_hotels, get_hotel, check_availability])`. Book 1's Alfama question again: predict — invent, refuse, or something new? The reply's `.content` is short or empty and `.tool_calls` holds `{name, args, id}`. The model chose a function and filled its arguments; it ran nothing. |
| 5 | md/code | **You run it, and you say so.** `search_hotels.invoke(call["args"])` gives the dict; wrap it as `ToolMessage(content=json.dumps(result), tool_call_id=call["id"])`, append both the `AIMessage` and the `ToolMessage`, call again — now the answer names real hotels. Show what the `tool_call_id` is for: drop it and the provider rejects the request. |
| 6 | md/code | **The loop.** `while reply.tool_calls:` run every call, append every `ToolMessage`, call again. Ask "is Casa do Castelo free 10–12 October and what would two nights cost?" — predict how many rounds: it needs an id before it can check availability. Print the final message list with roles and count the model calls. |
| 7 | md/code | **The loop ends when the model stops asking.** The same loop with "what cities do you cover?" — zero rounds, the `while` never enters. And with a question that needs two tools in one round ("the two cheapest Alfama hotels, are both free on 10–12 Oct?") — one `AIMessage` can carry several `tool_calls`, and each needs its own `ToolMessage`. |
| 8 | md/code | **The docstring is the prompt.** Bind a copy of `search_hotels` whose docstring is one word and whose arguments are undescribed; ask the Alfama question; watch the arguments come back wrong or the tool go unused. Restore the real one. This is why `tools.py` is frozen once it works (ADR-0006). |
| 9 | md | closing — you can hand the model functions and run its requests until it stops; every line of that loop is bookkeeping that never changes. Book 3 replaces the loop with `create_agent` and gets the answer back as a typed object instead of prose. |

## Done when

- `check_availability` returns `ok=False` with a reason for: unknown id, a
  stay straddling a gap, `check_out <= check_in`; `ok=True` with the right
  `nights` and `total` for the `lis-004` example in `spec.md`.
- Cell 4 produces a `tool_calls` list whose `args` match the question (city,
  district, price cap), with no hotel named in `.content`.
- Cell 6 terminates in two rounds; cell 7's first case in zero and second in
  one round with two `ToolMessage`s.
- Cell 8 shows a visible difference from the real docstring on the same
  question — wrong argument, missing filter, or no call at all.
- Every cell's trace opens in LangSmith under `hotelbot-book-2`, and the
  tool calls appear as child runs of the model call.

## Not in this book

`create_agent`, structured output, `lookup_policy`, `make_reservation`,
`reservations.json`, tool errors and retries (book 7), `tool_choice` /
forcing a tool, parallel execution of tool calls (they run sequentially in a
`for`). The system prompt is the book 1 one plus `TODAY`; iterating it is
book 6.
