# Book 3 — `create_agent`

**Status:** draft
**Decides:** ADR-0003 (`create_agent` is the only agent API from here on)

## What you can do after this that you couldn't before

Replace book 2's hand-written loop with one call, watch it do the same thing,
and get the answer back as a typed object a program can use instead of prose
it has to parse. `build_agent()` and `run()` exist after this book; every
later book adds to them rather than rebuilding the loop.

## Builds on

Book 2: the three catalogue tools and the `while reply.tool_calls` loop. The
first cell of this book runs book 2's cell-6 question and expects the same
messages.

## Module contracts

`hotelbot/models.py` — adds:

```python
class BookingProposal(BaseModel)   # hotel_id, check_in, check_out, nights, total, why
class PlainAnswer(BaseModel)       # text: str — for turns that aren't a proposal
```

`hotelbot/prompts.py` — the system prompt, versioned from the start so book 6
has somewhere to put v2 and v3:

```python
def get_prompt(version: str = "v1") -> str   # "v1" this book; fills in TODAY
```

`v1` is deliberately bare: who the assistant is, the four cities, today's
date, "produce ISO dates". No rules about checking availability or budgets
— that is what book 6 iterates.

`hotelbot/agent.py`

```python
@dataclass
class AgentResult:
    messages: list[BaseMessage]
    structured_response: BookingProposal | PlainAnswer | None

def build_agent(prompt_version="v1", middleware=(), checkpointer=None) -> agent
def run(agent, text, thread_id="default") -> AgentResult
```

`build_agent` this book: `create_agent(model, tools=[search_hotels, get_hotel,
check_availability], system_prompt=get_prompt(prompt_version),
response_format=ToolStrategy(BookingProposal | PlainAnswer))`. The
`middleware` and `checkpointer` arguments are accepted and passed through but
nothing uses them yet — book 5 does. `run` wraps `agent.invoke({"messages":
[HumanMessage(text)]}, config={"configurable": {"thread_id": thread_id}})`
and unpacks the state dict.

## Notebook outline

| # | kind | idea |
| --- | --- | --- |
| 0 | md | title — book 2's loop was six lines that never change; this book is the library call that owns them, and what it adds on top |
| 1 | code | `configure_tracing(3)`, model, import the three tools |
| 2 | md/code | **The loop as a call.** `create_agent(model, tools, system_prompt=...)`; invoke with book 2's "is Casa do Castelo free 10–12 October" question. `result["messages"]` has the same roles in the same order as book 2 — predict the count first. Open the trace: the same two model calls and two tool calls, now nested under one agent run. |
| 3 | md/code | **Watching it step.** `for step in agent.stream(..., stream_mode="updates")` — each step is one node's output: the model deciding, the tools running, the model deciding again. This is the loop iteration made visible. |
| 4 | md/code | **Prose breaks code.** Ask for a two-night Lisbon proposal; the answer is a paragraph. Try to pull the hotel id and total out with `re` — works. Rephrase the question slightly, run again, same regex — a different sentence shape, the regex misses. A program can't be built on this. |
| 5 | md/code | **Structured output.** `response_format=ToolStrategy(BookingProposal)`; same question; `result["structured_response"]` is a `BookingProposal` with typed fields. Look at the trace: the model produced the object by calling one more tool whose arguments *are* the object — structured output is a tool call the library reads back. |
| 6 | md/code | **Not every turn is a proposal.** "What cities do you cover?" with `BookingProposal` as the only format — predict: does it invent a booking? Then `ToolStrategy(BookingProposal \| PlainAnswer)`: the model picks the shape that fits. Two questions, two types back. |
| 7 | md/code | **Promoted.** `build_agent()` / `run()` from the package — the same two questions in two lines each. Everything from here on starts with these. |
| 8 | md | closing — you can run the loop with one call, stream its steps, and get a typed answer. It still forgets everything between calls and still knows nothing about policies: book 4 gives it documents, book 5 memory and a booking. |

## Done when

- Cell 2's message list matches book 2's cell 6 role-for-role.
- Cell 4 shows the regex succeeding once and failing once on two phrasings
  of the same request.
- Cell 5 returns a `BookingProposal` whose `total` equals
  `nights * price_per_night` for the hotel it names.
- Cell 6 returns `PlainAnswer` for the cities question and `BookingProposal`
  for the booking one.
- `run(build_agent(), ...)` works with no arguments beyond the text.

## Not in this book

Memory across calls (the `checkpointer` argument exists but is `None`),
middleware, `lookup_policy`, `make_reservation`, prompt quality (v1 is bare
on purpose), `ProviderStrategy` for structured output (one strategy, the
tool-based one, is enough to see the mechanism).
