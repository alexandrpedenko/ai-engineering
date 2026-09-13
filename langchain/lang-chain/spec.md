# hotelbot — spec

A hotel-booking assistant built on `langchain`'s `create_agent`. You describe
what you want in plain language, it searches a local catalogue, answers policy
questions from a small document set, and books — but only after you've said
yes.

```python
agent = build_agent()                                   # hotelbot.agent
run(agent, "two nights in Lisbon, 2026-10-10 to 10-12, under €150, near the old town")
# → BookingProposal(hotel_id="lis-004", nights=2, total=280.0, why="...")
run(agent, "book it")                                   # pauses: approve / edit / reject
```

This file is the architecture: what is true across every book. The per-book
plans live in `specs/`, and the decisions they rest on live in `adr/`. When a
book spec and this file disagree, **this file is right and the book spec is
stale**; anything a book discovers that changes a contract gets promoted up
here in the same commit.

## The books

| | book | status | spec |
| --- | --- | --- | --- |
| 1 | models and messages — one model call, message types, streaming | next | [specs/1-models-and-messages.md](specs/1-models-and-messages.md) |
| 2 | tools by hand — `@tool`, `bind_tools`, one tool loop written out | | specs/2-tools-by-hand.md |
| 3 | `create_agent` — the loop as a library call, structured output | | specs/3-create-agent.md |
| 4 | policy RAG — split, embed, retrieve, wrap as a tool | | specs/4-policy-rag.md |
| 5 | middleware and booking — human-in-the-loop, summarization, custom hooks, thread memory | | specs/5-middleware-and-booking.md |
| 6 | prompt iteration — three prompt versions, the prompt hub | | specs/6-prompt-iteration.md |
| 7 | reliability and guardrails — retries, fallbacks, tool errors, a poisoned document | | specs/7-reliability-and-guardrails.md |
| 8 | LangSmith — read a full booking trace: calls, tokens, latency, cost | | specs/8-langsmith.md |

## The decisions

Accepted, and binding until an ADR supersedes them.

| | decision |
| --- | --- |
| [0001](adr/0001-anthropic-chat-openai-embeddings.md) | Anthropic for chat, OpenAI for embeddings, both through `init_chat_model` / `langchain-openai` |
| [0002](adr/0002-local-json-fixed-dates.md) | Local JSON files are the only data source; dates are fixed ISO strings, never parsed from text |
| [0003](adr/0003-create-agent-only.md) | The manual tool loop is shown once; after that, `create_agent` is the only agent API used |
| [0004](adr/0004-no-booking-without-approval.md) | **No reservation is ever written without an explicit human approval** |
| [0005](adr/0005-rag-is-a-tool.md) | Retrieval is a tool the agent decides to call, not a step that runs before every turn |
| [0006](adr/0006-hotelbot-is-the-shared-package.md) | `hotelbot/` is the shared package for projects 2 and 3; its tool signatures are contracts |
| [0007](adr/0007-tracing-on-from-book-one.md) | LangSmith tracing is on from the first cell of book 1, one project per book |

## The shape of the application

One agent, one loop, four kinds of tool:

```
user message
    │
    ▼
 create_agent  ── system prompt (versioned, book 6)
    │              middleware stack (book 5, 7)
    │
    ├─ search_hotels / get_hotel / check_availability     read the catalogue
    ├─ lookup_policy                                      RAG over data/policies/
    ├─ make_reservation                                   write — pauses for approval
    │
    ▼
 BookingProposal (structured)  or  plain answer
```

The agent decides which tools to call and in what order. Everything the
notebooks teach is one of: how the model is called, how a tool is defined, how
the loop between them runs, or what wraps the loop (middleware, memory,
tracing).

## Data

All under `data/`, all committed, all small enough to read by eye (ADR-0002).

`hotels.json` — ~40 hotels across 4 cities (Lisbon, Porto, Madrid, Seville):

```json
{
  "id": "lis-004",
  "name": "Casa do Castelo",
  "city": "Lisbon",
  "district": "Alfama",
  "price_per_night": 140.0,
  "rating": 4.6,
  "amenities": ["breakfast", "wifi", "gym"],
  "available": [["2026-10-01", "2026-10-31"], ["2026-12-01", "2026-12-20"]]
}
```

`available` is a list of inclusive date ranges. A stay `[check_in, check_out)`
is available if it falls entirely inside one range. Dates are strings compared
lexicographically — ISO format makes that correct, and no date arithmetic
beyond counting nights is done anywhere.

`policies/*.md` — five documents, 3–6 paragraphs each: `cancellation.md`,
`pets.md`, `payment.md`, `accessibility.md`, `check-in.md`. Book 7 adds a
sixth, `loyalty.md`, that contains a prompt injection on purpose.

`reservations.json` — a list, empty at the start, appended by
`make_reservation`:

```json
{
  "id": "res-0001",
  "hotel_id": "lis-004",
  "guest": "olek",
  "check_in": "2026-10-10",
  "check_out": "2026-10-12",
  "nights": 2,
  "total": 280.0,
  "created_at": "2026-09-13T10:00:00"
}
```

## Module contracts

Everything the agent can call, frozen here because projects 2 and 3 import
them (ADR-0006). Bodies are pure Python over the JSON files; no tool calls a
model.

`hotelbot/catalogue.py`

```python
load_hotels() -> list[Hotel]                      # Pydantic model mirroring hotels.json
search_hotels(city, max_price=None, amenities=None, district=None) -> list[Hotel]
get_hotel(hotel_id) -> Hotel | None
check_availability(hotel_id, check_in, check_out) -> Availability   # ok, nights, total
```

`hotelbot/tools.py` — the same four, plus two, each decorated with `@tool` and
returning plain dicts/strings the model can read:

```python
search_hotels, get_hotel, check_availability          # book 2
lookup_policy(question) -> str                        # book 4, top-3 chunks joined
make_reservation(hotel_id, guest, check_in, check_out) -> Reservation   # book 5
```

`hotelbot/models.py`

```python
class Hotel(BaseModel)
class Availability(BaseModel)        # ok: bool, nights: int, total: float, reason: str | None
class Reservation(BaseModel)
class BookingProposal(BaseModel)     # hotel_id, check_in, check_out, nights, total, why
```

`hotelbot/agent.py`

```python
build_agent(prompt_version="v1", middleware=(), checkpointer=None) -> agent
run(agent, text, thread_id="default") -> AgentResult   # messages + structured_response
```

`hotelbot/config.py` — model ids, project name, paths. Pinned:

| Job | Model |
| --- | --- |
| Chat, agent | `claude-sonnet-5` |
| Cheap fallback / classification (book 7) | `claude-haiku-4-5-20251001` |
| Embeddings | `text-embedding-3-small` |

Needs `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `LANGSMITH_API_KEY` in the
repo-root `.env`; `LANGSMITH_TRACING=true` is set from `config.py`.

Dependencies to add to the Pipfile: `langchain`, `langchain-anthropic`,
`langchain-openai`, `langchain-text-splitters`, `langgraph` (checkpointers),
`langsmith`. `pydantic` and `python-dotenv` are already there.

## Where the model appears

| Job | Book | What it returns |
| --- | --- | --- |
| Answer from the system prompt alone | 1 | prose |
| Choose and fill a tool call | 2 | `AIMessage.tool_calls` |
| Run the whole loop | 3 | messages + `BookingProposal` |
| Decide when to look up a policy | 4 | a `lookup_policy` call, or none |
| Summarise old turns | 5 | a summary message replacing them |
| Screen retrieved text for instructions | 7 | allow / block |

The model never writes `reservations.json` directly. Only `make_reservation`
does, and only after the interrupt in book 5 has been resumed with an approval
(ADR-0004).

## Layout

A notebook contains only its own subject; anything an earlier book taught is
promoted into the package and imported from there.

```
langchain/lang-chain/
  idea.md                  the original draft — superseded by this file
  spec.md                  this file — architecture
  specs/                   one plan per book
  adr/                     decisions, numbered, superseding not deleting
  data/                    hotels.json, policies/, reservations.json
  hotelbot/                the package
  1-models-and-messages.ipynb … 8-langsmith.ipynb
```
