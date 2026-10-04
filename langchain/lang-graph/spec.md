# tripgraph — spec

A trip planner built on `langgraph`. You give it a brief in plain language; it
researches each city, assembles hotels, activities and transport into an
itinerary that fits the budget, shows you the draft, and books only what you
approve. Then the conversation goes on — "swap the Porto hotel", "one more
night in Lisbon" — and only the affected part is re-planned.

```
$ python -m tripgraph
you › Lisbon and Porto, 2026-10-10 to 2026-10-15, €900 total, food and museums, no departures before 09:00
  ▸ parse_brief  ▸ validate_brief  ▸ research ×2  ▸ assemble  ▸ check_budget  ▸ write_plan
  Lisbon  10–13 Oct  Casa do Castelo   €420   Gulbenkian, Time Out Market
  Porto   13–15 Oct  Hotel Aliados     €210   Serralves, Bolhão
  train Lisbon→Porto 13 Oct 09:39  €32         total €886 / €900
  approve · edit · reject ›
```

This file is the architecture and the roadmap. Project 1's `spec.md` rules
apply here too: book specs live in `specs/`, decisions in `adr/`, and when a
book spec and this file disagree **this file is right**. Once a book's build
has started, this file changes only through its `## Amendments` section or a
new ADR (repo CLAUDE.md).

Written against `langgraph` 1.2.11, `langchain` 1.4.0, `langchain-anthropic`
1.7.2 as installed on 2026-10-04.

## The books

The roadmap. Each book gets its full spec (cell outline, exact signatures)
just before it is built, written against what the previous books actually
produced. The paragraphs below fix what each book teaches, what it adds, and
what later books need from it; they don't fix cells.

| | book | status | spec |
| --- | --- | --- | --- |
| 1 | state, nodes, edges — a brief validated by a graph; reducers; the clarification edge | spec drafted | [specs/1-state-nodes-edges.md](specs/1-state-nodes-edges.md) |
| 2 | model nodes — parse the brief with a model; dependencies through the graph's context; fake-model tests | roadmap | — |
| 3 | the hotel agent by hand — a tool loop built from nodes, then used as a subgraph | roadmap | — |
| 4 | fan-out and loops — one research branch per city in parallel; the budget-trim loop; `Command` | roadmap | — |
| 5 | persistence — SQLite checkpoints, state history, resuming after quitting, a schema change | roadmap | — |
| 6 | human in the loop — review interrupt, approve/edit/reject, idempotent booking | roadmap | — |
| 7 | streaming — the four stream modes; the live CLI | roadmap | — |
| 8 | follow-ups and time travel — re-plan only what changed; forks for debugging | roadmap | — |
| 9 | supervisor — model-routed agents with handoffs, against the fixed planner | roadmap | — |
| 10 | cost and caching — model routing, prompt caching, node caching, timeouts | roadmap | — |
| 11 | production shape — Functional API, `langgraph dev`, Studio, the CLI over `RemoteGraph` | roadmap | — |
| 12 | evals: dataset and judge — code evaluators, LLM judge, trajectory evals | roadmap | — |
| 13 | evals: regression — two prompt versions compared, pairwise judge, an eval gate | roadmap | — |

### Book 1 — state, nodes, edges

**Teaches.** A graph is state plus nodes plus edges. State is a `TypedDict`; a
node reads it and returns only the keys it changes; `START` and `END`; what a
reducer is, introduced by a list that loses items without one (`operator.add`,
then `add_messages`); a conditional edge that sends an incomplete brief to
`ask_for_clarification`; the compiled graph drawn as Mermaid.
**Input** is a `TripBrief` already in structured form — no model in this book.
**Adds.** `domain/models.py` (`TripBrief`), `domain/rules.py`
(`missing_fields`, `split_nights`), `state.py`, `nodes/validate.py`,
`nodes/clarify.py`, `graphs/planner.py` (validate → clarify | END),
`tests/domain/`. `app/` with the shell: type a brief as JSON, see the
validated brief or the clarification question. The packaging from ADR-0001.
**Later books need.** The state keys of the contract below; the shell's
command/renderer seams (book 5 onwards add to them); `split_nights`.
**Done when.** `pytest tests/domain` passes; the graph routes a complete and
an incomplete brief differently; `python -m tripgraph` runs.

### Book 2 — model nodes

**Teaches.** A node that calls a model is still just a node. `parse_brief`
turns text into a `TripBrief` with structured output. Dependencies arrive
through `context_schema` and `Runtime` — shown by first writing a node that
builds its own model and failing to test it. `ScriptedModel` (a fake model) in a
node test. `RetryPolicy` on `parse_brief` for a structured output that fails
validation. `input_schema` / `output_schema` so callers see text in, brief out.
**Adds.** `context.py` (`TripContext` with the models only), `llm.py`,
`nodes/parse.py`, `testing.py` (`ScriptedModel`), `tests/nodes/`, `data/briefs/`.
**Later books need.** `TripContext` and `make_context()`; every later node takes
its model and adapters from `runtime.context`.
**Done when.** A plain-language brief parses in the notebook and in the CLI;
the node test passes with no API key; a brief with no dates goes to
clarification (ADR-0005).

### Book 3 — the hotel agent by hand

**Teaches.** Project 1's agent loop built from parts: a model node with
`bind_tools`, `ToolNode`, `tools_condition`, the edge back to the model,
`recursion_limit`. Same request through `hotelbot.build_agent` and through
this graph, traces compared. Then the agent as a subgraph in the planner:
different state schemas for parent and child, and the node that maps between
them. Its result is a typed `HotelShortlist`, not prose.
**Adds.** `adapters/hotels.py` (protocol + JSON implementation over
`hotelbot.catalogue`), the agent's tools built from that adapter
(`hotel_tools(adapter)`), so a test can hand the agent an in-memory catalogue;
`graphs/hotel_agent.py`; `HotelOption` and `HotelShortlist`; a planner that
validates and shortlists hotels for the first city.
**Later books need.** `build_hotel_agent(ctx)` returning a compiled graph that
takes a city, dates, a nightly cap and amenities, and returns a
`HotelShortlist`.
**Done when.** The hand-built agent and `create_agent` find the same hotel for
the same request; a test with a scripted fake model drives the loop through
two tool calls to an answer.

### Book 4 — fan-out and loops

**Teaches.** `Send` to start one `city_research` branch per city; a reducer
that merges their results; timing sequential vs parallel. A loop:
`check_budget` → `trim` → `check_budget`, with `trims` in state as the guard.
`Command(goto=..., update=...)` to route from inside a node, next to the
conditional edge doing the same job.
**Adds.** `graphs/city_research.py` (hotel agent + `pick_activities`),
`nodes/assemble.py`, `nodes/budget.py`, `nodes/write.py`, `domain/budget.py`,
`data/activities.json`, `data/transport.json`, `adapters/activities.py`,
`adapters/transport.py`. The planner now produces a full
`Itinerary`; `write_plan` writes the text summary.
**Later books need.** The full planner topology below, minus review and
booking.
**Done when.** A two-city brief produces an itinerary within budget; an
over-budget brief goes round the trim loop and stops at the guard; parallel
research is measurably faster in the trace.

### Book 5 — persistence

**Teaches.** A checkpointer saves the state after every step: `InMemorySaver`,
then `SqliteSaver` at `data/tripgraph.sqlite`. `thread_id`; `get_state`;
`get_state_history` as the list of every step's state. Quit the CLI mid-plan,
start it again, resume. Durability modes. Add a key to the state and resume
a thread saved before the change.
**Adds.** `checkpoints.py` (`open_checkpointer()`), `app/session.py`; CLI
`/threads`, `/resume <id>`, `--thread`.
**Later books need.** A compiled planner that always has a checkpointer.
**Done when.** A plan started, quit and resumed from the CLI finishes without
re-running the steps already done.

### Book 6 — human in the loop

**Teaches.** `interrupt()` in `review_draft` with the draft as its payload;
`Command(resume=...)` carrying approve, edit or reject. The interrupted node
runs again from its first line on resume — shown by a "hold the room" call
placed before the interrupt running twice. The fix: an idempotency key the
bookings adapter checks. P1's ADR-0004 rebuilt in a graph (ADR-0004 here).
**Adds.** `nodes/review.py`, `nodes/book.py`, `adapters/bookings.py`; the CLI
approval screen.
**Later books need.** `ReviewDecision`; the rule that `book` is reachable only
from an approve.
**Done when.** Approve writes exactly one reservation per city even if the
resume is sent twice; reject writes none; edit changes what is booked.

### Book 7 — streaming

**Teaches.** `stream_mode` `"updates"` (what each node changed), `"values"` (the
whole state after each step), `"messages"` (model tokens as they arrive),
`"custom"` (progress events from inside a node via `get_stream_writer`);
several modes at once; `subgraphs=True` to see inside the research branches.
**Adds.** `app/render.py` live views; nodes emit progress events.
**Later books need.** The shell renders a stream, not a final result.
**Done when.** The CLI shows each node as it runs and the plan text arriving
token by token.

### Book 8 — follow-ups and time travel

**Teaches.** A follow-up message classified into a `FollowUp` ("swap the Porto
hotel" → change the hotel, Porto); `update_state` plus `Command(goto=...)` re-runs
only the affected node. Time travel, separately, as a debugging tool: pick a
checkpoint from the history, change one value, run from there, compare the
two branches.
**Adds.** `nodes/intake.py` (the entry router), `nodes/edit.py`; CLI plain
follow-ups, `/history`, `/fork <checkpoint>`.
**Later books need.** `intake` as the planner's first node.
**Done when.** "swap the Porto hotel" changes Porto only — Lisbon's research
is not re-run (visible in the trace); a fork from an earlier checkpoint
produces a second, different itinerary on the same thread.

### Book 9 — supervisor

**Teaches.** Multi-agent with handoffs: a supervisor model choosing between
hotel, activities and budget agents; `Command(goto=..., graph=Command.PARENT)`
for a handoff out of a subgraph. The same briefs through the fixed planner
and the supervisor, traces and results compared.
**Adds.** `graphs/supervisor.py`; CLI `--graph supervisor`.
**Later books need.** Nothing — the planner stays the main graph.
**Done when.** Both graphs plan the same three briefs; the comparison shows
calls, tokens and constraint results side by side.

### Book 10 — cost and caching

**Teaches.** Tokens and cost per node from the trace; the cheap model for
parsing and classifying, the strong one only for `write_plan`; Anthropic
prompt caching on the long static planning prompt; node `CachePolicy` so an
unchanged research branch is not re-run; node `timeout` and `error_handler`.
**Adds.** Model roles in `llm.py` used everywhere; `costs.py`; CLI `/cost`.
**Done when.** The same brief run before and after shows the cost and latency
drop, and the cached-token count on the second run.

### Book 11 — production shape

**Teaches.** The planner in the Functional API (`@entrypoint`, `@task`) next to
the graph version, with the same tests passing. `langgraph.json`,
`langgraph dev`, the graph in LangGraph Studio. The CLI talking to that server
through `RemoteGraph` — the same shell, a different graph object.
**Adds.** `graphs/planner_functional.py`, `langgraph.json`, CLI `--server <url>`.
**Done when.** One conversation in the CLI against the local server, with an
approval, visible in Studio.

### Book 12 — evals: dataset and judge

**Teaches.** A dataset of ~15 briefs with expected constraints; code
evaluators built on `domain/rules.py`; an LLM judge for "sensible for the
stated interests", checked against your own grades; trajectory evaluators
(which nodes ran, did the hotel agent check availability before proposing);
examples added from real CLI traces.
**Adds.** `evals/`.
**Done when.** One experiment in LangSmith with every evaluator scored, and a
written note of where the judge and you disagree.

### Book 13 — evals: regression

**Teaches.** Change the planning prompt, run the same dataset, compare the
two experiments; a pairwise judge; `pytest -m eval` that fails when a key
score drops below the last accepted run.
**Done when.** Two experiments compared; the eval gate fails on a deliberately
worse prompt and passes on the original.

## The decisions

| | decision |
| --- | --- |
| [0001](adr/0001-installable-packages.md) | `hotelbot` and `tripgraph` are installable packages (editable path installs in the Pipfile); no `sys.path` edits |
| [0002](adr/0002-rules-are-plain-code.md) | Budget, night split and constraint checks are plain code in `domain/`; a model never computes or checks them |
| [0003](adr/0003-dependencies-through-context.md) | Models and adapters reach nodes only through `TripContext` (`context_schema`); no module-level clients |
| [0004](adr/0004-booking-only-after-review.md) | **`book` runs only after `review_draft` was resumed with an approval, and is idempotent** |
| [0005](adr/0005-dates-only-as-iso-in-brief.md) | Dates come only as ISO strings stated in the brief; a brief without them goes to clarification |
| [0006](adr/0006-tests-never-call-a-model.md) | `tests/` never call a real model; real-model checks live in `evals/` |

Project 1's ADRs carried over unchanged: 0001 (Anthropic chat, OpenAI
embeddings), 0002 (local JSON, fixed dates — extended by 0005 here), 0006
(`hotelbot` is the shared package), 0007 (tracing on from book 1, one
LangSmith project per book — `tripgraph-book-<n>`).

## The shape of the application

The planner graph when book 8 is done. Plain-code nodes are marked `·`, model
nodes `◆`:

```
START
  │
  ▼
◆ intake ──follow-up──▶ · apply_edit ──Command(goto=…)──▶ the affected node
  │ new brief
  ▼
◆ parse_brief ─▶ · validate_brief ──missing──▶ · ask_for_clarification ─▶ END
                       │ complete
                       ▼
               Send × each city
     ┌─────────────────┴─────────────────┐
     ▼                                   ▼
 city_research (subgraph)        city_research (subgraph)
   ◆ hotel_agent (subgraph: model ⇄ ToolNode)
   ◆ pick_activities
     └─────────────────┬─────────────────┘
                       ▼  research merged by reducer
               · assemble_itinerary
                       ▼
               · check_budget ──over, trims < 3──▶ · trim ─┐
                       │ ok or guard hit         ◀─────────┘
                       ▼
               ◆ write_plan
                       ▼
               · review_draft  ── interrupt(): approve / edit / reject
                 │ approve        │ edit → apply_edit    │ reject → END
                 ▼
               · book ─▶ END
```

Everything a notebook teaches is one of: how state flows between nodes, how a
node calls a model or a tool, how the graph is routed, what persists between
runs, or how the outside world (the CLI, a server, an eval) drives it.

## Layout and dependency rule

```
langchain/lang-graph/
  idea.md  spec.md  specs/  adr/
  pyproject.toml           tripgraph as a package (ADR-0001)
  langgraph.json           book 11
  data/                    activities.json, transport.json, briefs/,
                           bookings.json (gitignored), tripgraph.sqlite (gitignored)
  tripgraph/
    domain/                models.py, rules.py, budget.py — imports nothing from tripgraph
    adapters/              hotels.py, activities.py, transport.py, bookings.py
    config.py              paths, tracing, model roles (re-uses hotelbot.config ids)
    context.py             TripContext, make_context()
    llm.py                 model by role
    state.py               PlannerState, reducers, input/output schemas
    checkpoints.py         book 5
    testing.py             ScriptedModel — the fake model tests use (book 2)
    nodes/                 one module per node
    graphs/                planner.py, hotel_agent.py, city_research.py, supervisor.py, planner_functional.py
    app/                   shell.py, render.py, commands.py, session.py
    __main__.py            python -m tripgraph
  tests/                   domain/, nodes/, graphs/
  evals/                   book 12
  1-state-nodes-edges.ipynb … 13-evals-regression.ipynb
```

Imports go one way: `domain` ← `adapters` ← `nodes` ← `graphs` ← `app`.
`domain` imports nothing from `tripgraph`, and only `hotelbot.models` from
`hotelbot`. `app` imports graphs and never a node. Notebooks import from
`tripgraph` like any other user of the package; a notebook contains only its
own subject.

## Data

All local, committed, small enough to read by eye (P1 ADR-0002). Hotels come
from `hotelbot`'s `data/hotels.json` through `adapters/hotels.py` — 40 hotels,
4 cities, available 2026-10-01…10-31 and 2026-12-01…12-20.

`activities.json` — ~8 per city (book 2):

```json
{
  "id": "lis-act-03",
  "city": "Lisbon",
  "name": "Gulbenkian Museum",
  "tags": ["museums", "art"],
  "price": 15.0,
  "hours": 3
}
```

`transport.json` — a daily timetable between each pair of cities (book 4). A
leg runs every day, so no date logic is needed; times are `HH:MM` strings and
compare as strings:

```json
{
  "id": "lis-opo-0939",
  "from_city": "Lisbon",
  "to_city": "Porto",
  "mode": "train",
  "departs": "09:39",
  "arrives": "12:31",
  "price": 32.0
}
```

`briefs/*.txt` — sample briefs in plain language, some deliberately missing a
city, dates or budget. Reused by the CLI, the notebooks and the eval dataset.

`bookings.json` — the idempotency ledger (book 6): `{idempotency_key:
reservation_id}`. Reservations themselves are still written only by
`hotelbot.reservations.add_reservation` (P1 ADR-0006).

## Contracts

Frozen once the book that introduces them is built; later changes go through
`## Amendments` or an ADR. Shapes below are the target — the book spec pins
exact field lists.

`tripgraph/domain/models.py` — Pydantic, no behaviour:

```python
class TripBrief(BaseModel)       # cities, start, end (ISO), budget (EUR, total), travellers,
                                 # interests, earliest_departure ("HH:MM" | None), amenities
class HotelOption(BaseModel)     # hotel_id, name, district, price_per_night, total, why
class HotelShortlist(BaseModel)  # city, options: list[HotelOption]  (ranked, best first)
class CityResearch(BaseModel)    # city, check_in, check_out, hotels: HotelShortlist,
                                 # activities: list[Activity]
class TransportLeg(BaseModel)    # mirrors transport.json, plus date
class CityStay(BaseModel)        # city, check_in, check_out, hotel: HotelOption, activities
class Itinerary(BaseModel)       # stays: list[CityStay], legs: list[TransportLeg]
class BudgetCheck(BaseModel)     # hotels, activities, transport, total, budget, ok
class ReviewDecision(BaseModel)  # kind: approve | edit | reject, edit: str | None
class FollowUp(BaseModel)        # kind, city | None, detail — book 8
```

`tripgraph/domain/rules.py`, `budget.py` — pure functions, the only place the
trip's rules live (ADR-0002):

```python
missing_fields(brief) -> list[str]
split_nights(brief) -> list[tuple[str, str, str]]          # (city, check_in, check_out)
check_budget(itinerary, budget) -> BudgetCheck
violations(itinerary, brief) -> list[str]                   # also the book-12 code evaluator
```

`tripgraph/state.py` — the planner state, with the book that adds each key:

```python
class PlannerState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]   # 1  the conversation the CLI shows
    brief: TripBrief | None                               # 1
    missing: list[str]                                    # 1
    research: Annotated[list[CityResearch], merge_by_city]  # 3 (one city), 4 (fan-in)
    itinerary: Itinerary | None                           # 4
    budget: BudgetCheck | None                            # 4
    trims: int                                            # 4  the loop guard
    plan_text: str | None                                 # 4
    decision: ReviewDecision | None                       # 6
    reservations: list[dict]                              # 6
    follow_up: FollowUp | None                            # 8
```

`merge_by_city` replaces a city's entry instead of appending, so a re-run of
one city (book 8) overwrites it.

`tripgraph/context.py` (ADR-0003):

```python
@dataclass
class TripContext:
    models: ModelRoles              # book 2 — parse, classify, agent, write: chat models by role
    hotels: HotelsAdapter           # book 3
    activities: ActivitiesAdapter   # book 4
    transport: TransportAdapter     # book 4
    bookings: BookingsAdapter       # book 6
    guest: str = "olek"

make_context(**overrides) -> TripContext    # real models and JSON adapters unless overridden
```

`tripgraph/adapters/` — each a `Protocol` plus one JSON implementation; tests
pass in-memory ones:

```python
HotelsAdapter.search(city, max_price=None, amenities=None) -> list[Hotel]
HotelsAdapter.availability(hotel_id, check_in, check_out) -> Availability
ActivitiesAdapter.for_city(city) -> list[Activity]
TransportAdapter.legs(from_city, to_city, earliest="00:00") -> list[TransportLeg]
BookingsAdapter.book(key, hotel_id, guest, check_in, check_out) -> Reservation   # same key → same reservation
```

`tripgraph/testing.py` (book 2, ADR-0006):

```python
class ScriptedModel(GenericFakeChatModel)   # bind_tools → self; with_structured_output → next scripted tool call as the schema
```

`tripgraph/graphs/planner.py`:

```python
build_planner(checkpointer=None) -> CompiledStateGraph   # context_schema=TripContext
plan(graph, text, ctx, thread_id=None) -> PlannerResult  # one turn: state, interrupt, thread_id
resume(graph, decision, ctx, thread_id) -> PlannerResult # book 6
```

`build_planner` returns the graph the book has reached; earlier notebooks keep
working because each book only adds nodes after `validate_brief`'s complete
branch.

`tripgraph/app/` — the shell knows nothing about trips, so project 3 can reuse
it:

```python
run_shell(graph, *, make_ctx, commands, renderer, thread_id=None) -> None
```

`commands` maps `/name` to a handler; `renderer` turns stream events and
interrupts into terminal output. Pinned in book 1's spec, extended by books
5–11.

## The CLI across books

| book | `python -m tripgraph` gains |
| --- | --- |
| 1 | the shell; a brief typed as JSON → validated brief or a question; `/quit`, `/help` |
| 2 | briefs in plain language |
| 4 | the full itinerary table and budget line |
| 5 | `/threads`, `/resume <id>`, `--thread <id>`; quitting doesn't lose the plan |
| 6 | the approval screen — approve / edit / reject |
| 7 | live node progress; plan text streamed |
| 8 | follow-ups in plain language; `/history`, `/fork <checkpoint>` |
| 9 | `--graph supervisor` |
| 10 | `/cost` |
| 11 | `--server <url>` |

## Where the model appears

| Job | Node | Book | Model role | Returns |
| --- | --- | --- | --- | --- |
| Read a brief | `parse_brief` | 2 | parse (cheap from book 10) | `TripBrief` |
| Find hotels | `hotel_agent` | 3 | agent | `HotelShortlist` via tool calls |
| Pick activities | `pick_activities` | 4 | agent | ids from the city's list |
| Write the plan text | `write_plan` | 4 | write (strong) | prose |
| Classify a follow-up | `intake` | 8 | classify (cheap) | `FollowUp` |
| Route between agents | supervisor | 9 | agent | a handoff |
| Judge an itinerary | evals | 12–13 | judge | score + reason |

The model never computes a total, decides whether the budget is met, or
writes a reservation (ADR-0002, ADR-0004).

## Configuration and dependencies

`tripgraph/config.py` reuses `hotelbot.config` for model ids, `PRICING` and
`TODAY`, and adds tripgraph's paths and `configure_tracing(book)` (project
`tripgraph-book-<n>`). Same `.env` at the repo root.

Pipfile additions, each in the book that first needs it: `hotelbot` and
`tripgraph` as editable path installs, `rich`, `prompt_toolkit` (1);
`langgraph-checkpoint-sqlite` (5); `langgraph-cli[inmem]` (11); `openevals`
and/or `agentevals` (12, checked for fit when that spec is written).
`pytest` moves to dev-packages (1).
