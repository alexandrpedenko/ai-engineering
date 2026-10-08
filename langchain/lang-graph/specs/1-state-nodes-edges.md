# Book 1 — state, nodes, edges

**Status:** in progress — slice 1 of 5 built
**Decides:** ADR-0001 (installable packages), ADR-0002 (rules are plain code),
ADR-0005 (ISO dates only), ADR-0006 (tests never call a model)
**Written against:** `langgraph` 1.2.11, `langchain-core` 1.6.4, `rich` 15.0.0,
`prompt_toolkit` 3.0.53 (installed 2026-10-04)

## What you can do after this that you couldn't before

Build a LangGraph graph from scratch and say what it will do before you run
it: what state it carries, what each node changes, which way it branches,
and what happens when two nodes write the same key. Run the planner's first
version from a terminal — type a trip brief, get back either the brief with
its nights split across cities, or a question about what's missing.

No model anywhere in this book. The brief is typed as JSON; book 2 replaces
that with plain language.

## Builds on

Project 1's idea of a conversation as a list of messages (book 1) and of a
loop as nodes joined by a decision (book 2's hand-written tool loop). Nothing
from `hotelbot` is imported yet; the packaging slice makes it importable for
book 3.

## Module contracts

**Packaging (ADR-0001).**
`langchain/lang-chain/pyproject.toml` (package `hotelbot`) and
`langchain/lang-graph/pyproject.toml` (package `tripgraph`), setuptools,
no dependencies listed (the Pipfile owns them). Pipfile gains both as editable
path installs, `rich` and `prompt_toolkit` explicitly (they are already
installed as dependencies of other packages), and `pytest` under
`[dev-packages]`. `pytest` config in `lang-graph/pyproject.toml`:
`testpaths = ["tests"]`.

`tripgraph/config.py`

```python
PROJECT_ROOT: Path                        # lang-graph/
DATA_DIR: Path
def configure_tracing(book: int) -> None  # as hotelbot's, project "tripgraph-book-<n>"
```

`tripgraph/domain/models.py`

```python
class TripBrief(BaseModel):
    cities: list[str] = []
    start: str | None = None              # ISO date, ADR-0005
    end: str | None = None                # ISO date, the day you leave the last city
    budget: float | None = None           # EUR, whole trip
    travellers: int = 1
    interests: list[str] = []
    earliest_departure: str | None = None # "HH:MM" — used from book 4
    amenities: list[str] = []
```

Every field has a default so that a half-filled brief is still a `TripBrief`
— what's missing is a rule's job to say, not a validation error.

`tripgraph/domain/rules.py` — pure, imports nothing from `tripgraph`:

```python
PROBLEMS: dict[str, str]     # code -> question to ask, e.g. "budget" -> "What's the total budget in euros?"

missing_fields(brief) -> list[str]
# codes, in a fixed order: "cities", "start", "end", "budget",
# "dates_order" (end not after start), "too_few_nights" (fewer nights than cities).
# An unparseable ISO date counts as missing. [] means the brief is complete.

nights(brief) -> int                                  # (end - start).days

split_nights(brief) -> list[tuple[str, str, str]]
# (city, check_in, check_out), in the brief's city order. nights // cities each,
# the remainder one extra night each to the first cities.
# 5 nights, Lisbon+Porto -> Lisbon 3, Porto 2. Assumes missing_fields(brief) == [].
```

`tripgraph/state.py`

```python
class PlannerState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    brief: TripBrief | None
    missing: list[str]
```

The first three keys of the `spec.md` contract; later books add the rest.

`tripgraph/nodes/` — each node takes `PlannerState`, returns only what it
changes:

```python
read_brief(state)             # last human message as JSON -> {"brief": TripBrief}
                              # not JSON / wrong shape -> {"brief": TripBrief()} (so every field is missing)
validate_brief(state)         # -> {"missing": missing_fields(brief)}
ask_for_clarification(state)  # -> {"messages": [AIMessage(the PROBLEMS questions, one per line)]}
confirm_brief(state)          # -> {"messages": [AIMessage(split_nights as text + budget)]}
route_after_validate(state) -> Literal["ask_for_clarification", "confirm_brief"]
```

`read_brief` is book 1's stand-in for book 2's `parse_brief`; `confirm_brief`
is the stand-in for the research that books 3–4 put on the complete branch.
Both are replaced, not grown.

`tripgraph/graphs/planner.py`

```python
build_planner(checkpointer=None) -> CompiledStateGraph
# START -> read_brief -> validate_brief -> route_after_validate
#   -> ask_for_clarification -> END | confirm_brief -> END

@dataclass
class PlannerResult:
    state: dict
    reply: str                 # text of the last AIMessage
    thread_id: str
    interrupt: dict | None = None   # always None until book 6

plan(graph, text, ctx=None, thread_id=None) -> PlannerResult
# one turn: {"messages": [HumanMessage(text)]} in, unpacked state out.
# ctx is accepted and ignored until book 2; thread_id is a fresh uuid when None
```

`tripgraph/app/` — the shell knows nothing about trips:

```python
# shell.py
run_shell(graph, *, renderer, commands=None, make_ctx=None, thread_id=None, read=None) -> None
# loop: read a line; "/name args" -> commands[name](shell, args); anything else ->
# plan(graph, line, ctx=make_ctx() if make_ctx else None, thread_id=...) -> renderer.reply(result).
# read defaults to a prompt_toolkit PromptSession (history, ↑ to recall); tests pass a
# function that yields scripted lines. Ctrl-D, Ctrl-C and /quit exit cleanly.

class Renderer(Protocol):
    def welcome(self) -> None
    def reply(self, result: PlannerResult) -> None
    def error(self, exc: Exception) -> None      # a failing turn prints and the loop continues

# commands.py — built-ins every app gets: /help, /quit
# render.py   — TripRenderer: rich panel for the reply; a table for the night split
# __main__.py — python -m tripgraph: builds the planner, adds /example (prints a
#               sample brief JSON to copy). No tracing from the CLI yet — there is
#               no model to trace; book 2 turns it on.
```

No checkpointer yet, so each line typed is a separate run — the shell says so
in `/help`. Book 5 makes turns share a thread.

## Tests

- `tests/domain/test_rules.py` — `missing_fields` on a complete brief, one
  with each field absent, an unparseable date, end before start, 2 nights
  for 3 cities; `split_nights` for 5 nights / 2 cities (3, 2), 6 / 3
  (2, 2, 2), 7 / 3 (3, 2, 2), 4 / 1; check-out of one city equals check-in
  of the next and the last check-out equals `end`.
- `tests/graphs/test_planner.py` — a complete brief ends in a reply from
  `confirm_brief`; a brief without dates ends in a reply from
  `ask_for_clarification` listing both date questions; non-JSON text asks for
  everything.
- `tests/app/test_shell.py` — scripted `read` with a brief, `/help`,
  `/quit`: the renderer gets one reply and the loop ends; an exception in a
  turn reaches `renderer.error` and the loop goes on.

All run with no API key (ADR-0006): there is no model in this book.

## Slices

1. **Packaging and the rules** — both `pyproject.toml` files, Pipfile,
   `config.py`, `domain/models.py`, `domain/rules.py`, `tests/domain/`; cells 0–4.
2. **Nodes and a graph** — `state.py`, `read_brief`, `validate_brief`; cells 5–6.
3. **Reducers** — notebook only (toy graphs in the cells); cells 7–9.
4. **Routing and the planner** — `ask_for_clarification`, `confirm_brief`,
   `route_after_validate`, `graphs/planner.py`, `tests/graphs/`; cells 10–11.
5. **The CLI** — `app/`, `__main__.py`, `tests/app/`; cells 12–13.

## Notebook outline

`1-state-nodes-edges.ipynb`. Toy data first: two briefs reused throughout —
`COMPLETE` (Lisbon + Porto, 2026-10-10 to 2026-10-15, €900, food and
museums) and `NO_DATES` (the same without start and end).

| # | kind | idea |
| --- | --- | --- |
| 0 | md | title — a planner that turns a trip brief into a plan, built as a graph; this book builds the first two steps and the app around them, with no model |
| 1 | code | `configure_tracing(1)`; imports from `tripgraph` |
| 2 | md/code | **The brief.** `TripBrief` printed for `COMPLETE` and `NO_DATES`. A half-filled brief is still a valid object — every field has a default. |
| 3 | md/code | **Rules are plain functions.** `missing_fields` on both. Then nights: `nights(COMPLETE)` — predict it first (10th to 15th). Then `split_nights(COMPLETE)` — predict how 5 nights split across 2 cities, then 7 across 3; the remainder rule shown as numbers (7 // 3 = 2 each, 7 % 3 = 1 extra, to the first city). |
| 4 | md/code | **Rules have tests.** Print one test from `tests/domain/test_rules.py`; run `!pytest tests/domain -q`. The rules are checked without running anything else. |
| 5 | md/code | **A node is a function that returns what it changed.** Call `validate_brief` directly on a dict holding `COMPLETE`, then `NO_DATES`: it returns `{"missing": [...]}` only, not the whole state. |
| 6 | md/code | **A graph runs nodes and merges what they return.** `StateGraph(PlannerState)`, `read_brief` → `validate_brief`, `START`, `END`, `compile()`, `invoke` with the brief as a JSON message. Predict which keys the result holds. Every key: each node's partial update merged into the state. |
| 7 | md/code | **When two nodes write the same key.** Toy state `notes: list[str]`; node `a` writes `["dates ok"]`, node `b` writes `["budget ok"]`, in sequence. Predict the final `notes`. Only `["budget ok"]` — the second write replaced the first. Then the same two nodes side by side, both from `START`: the run raises `InvalidUpdateError` — in one step there's no "last". |
| 8 | md/code | **A reducer says how to combine.** A reducer is a function `(old, new) -> combined`: `operator.add(["start"], ["dates ok"])` as numbers first. `Annotated[list[str], operator.add]`; the sequential graph keeps all three, the parallel one runs. This is what book 4's per-city branches need. |
| 9 | md/code | **The conversation's reducer.** `add_messages` called directly: a new message is appended; a message with an id already in the list replaces it. Why `messages` in `PlannerState` uses it rather than `operator.add`. |
| 10 | md/code | **Route on the state.** `route_after_validate` called directly on both states — it returns a node name. Then `add_conditional_edges`; `COMPLETE` and `NO_DATES` through the graph; print `reply` for each. |
| 11 | md/code | **See the graph.** `build_planner()` — the same wiring, now in the package — drawn with `draw_mermaid_png()` (rendered by the mermaid.ink web service; `draw_mermaid()` prints the text if offline). |
| 12 | md | **Talk to it.** Run `python -m tripgraph` from `langchain/lang-graph/` in a terminal. Things to try: `/example` and paste it; the same brief with the dates removed; plain text like "Lisbon next week" (it asks for everything — that's book 2's problem); `/help`. |
| 13 | md | closing — you can build a graph, predict its state, merge writes with a reducer and branch on state; the planner runs as an app. It can't read a brief written in words — book 2 puts a model in a node for that. |

## Done when

- `pytest` passes from `langchain/lang-graph/`, with no API key.
- `import hotelbot` and `import tripgraph` work from any directory in the
  Pipfile environment; project 1's notebooks still import `hotelbot`.
- Cell 7 shows `["budget ok"]`, then `InvalidUpdateError`; cell 8 shows all
  three notes, in both the sequential and parallel graphs.
- Cell 10's `COMPLETE` reply lists Lisbon 10–13 Oct (3 nights) and Porto
  13–15 Oct (2 nights); `NO_DATES`'s reply asks for the start and end dates.
- In the terminal: `/example` pasted back gives the night split; a brief
  with no budget asks for it; Ctrl-D exits without a traceback.

## Not in this book

Models (book 2). `hotelbot` imports beyond the packaging check (book 3).
Checkpointers and threads (book 5) — each CLI line is a separate run. Streaming
(book 7). `Command` (book 4). Graph context / `context_schema` (book 2).
