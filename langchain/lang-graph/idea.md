# Project 2 — Trip planner (`langgraph`)

Revised 2026-10-04 after project 1. Supersedes the first draft (git history has
it). Written against `langgraph` 1.2.11 as installed; re-checked against the
installed source when each book spec is written.

## Domain and business goal

A trip planner you talk to. You give it a brief ("Lisbon and Porto, 5 days,
€900 total, likes food and museums, no early flights"), it plans a hotel per
city, activities and transport, and shows you a draft with a budget breakdown.
Then the conversation continues: "swap the Porto hotel", "add a day in
Seville", "cheaper" — and it re-plans only the part that changed. Nothing is
booked until you approve the draft.

Business goal: a plan that meets every hard constraint in the brief (budget,
cities, dates, no early transport), made in one conversation, with the user
able to change one part without the rest being redone and without anything
booked behind their back.

Why a graph and not `create_agent`: some steps are plain code (validate the
brief, add up the budget, check constraints), some need a model (read the
brief, pick activities, write the plan), and the order between them matters.
In a single tool-calling loop the model decides whether to run the budget
check; in a graph the check always runs, and each step is a node you can see,
test and re-run alone.

Data: project 1's hotel catalogue and tools (imported from `hotelbot`), plus
new local files — `activities.json`, `transport.json` (with departure times, so
"no early flights" is checkable), and `briefs/` with sample trip briefs.

## The app — a real chat loop, grown across books

The project is an application first and a set of notebooks second. From book 1
there is a command you can run in a terminal:

```
python -m tripgraph                 # new conversation
python -m tripgraph --thread t-42   # continue an earlier one
```

It starts minimal and every book adds what that book taught, so the finished
loop isn't written in a single book:

| book | the chat loop gains |
| --- | --- |
| 1 | type a brief as JSON, get the validated brief back — the shell, `rich` output |
| 2 | type the brief in plain language |
| 5 | threads: `/threads`, `/resume <id>`, survives quitting the program |
| 6 | the approval screen: approve / edit / reject a draft before booking |
| 7 | live progress: which node is running, plan text streaming in token by token |
| 8 | follow-up edits in plain language; `/history`, `/fork <checkpoint>` |
| 10 | `/cost` — tokens and € for this turn, per node |
| 11 | the same chat loop talking to the graph running as a local server |

Notebooks teach the mechanism; the CLI is where you use it as a user. Each
book's "done when" includes something you do in the CLI yourself.

## Architecture — shaped like a real application

```
lang-graph/
  spec.md  specs/  adr/  idea.md
  data/        activities.json, transport.json, briefs/, tripgraph.sqlite (gitignored)
  tripgraph/
    domain/    pure Python, no model, no I/O: TripBrief, Itinerary, Budget,
               budget math, constraint checks — the rules of a valid trip
    adapters/  where data comes from: hotels (wraps hotelbot), activities,
               transport, bookings — each behind a small Protocol
    llm.py     model registry: which model does which job, fallbacks, caching
    context.py TripContext — models, adapters, clock, user id; handed to every
               node through the graph's context, never imported as a global
    state.py   graph state, reducers, input / output schemas
    nodes/     one module per step; plain-code and model nodes side by side
    graphs/    planner (main), city_research (subgraph), hotel_agent
               (subgraph), supervisor (book 9)
    app/       shell.py (the loop), render.py (rich views), commands.py
               (/threads, /history, /cost…), session.py (thread bookkeeping)
    __main__.py
  tests/       domain/ (pure), nodes/ (fake models), graphs/ (routes, loops,
               interrupts) — all run with no API key
  evals/       datasets/, evaluators.py, run_experiment.py
  langgraph.json
```

Rules that make it behave like a real codebase:

- **Dependencies point inward.** `domain/` imports nothing from the rest;
  nodes call domain functions and adapters; graphs wire nodes; `app/` only
  talks to compiled graphs.
- **Nothing reaches for a global.** Models and adapters arrive through
  `TripContext` (`context_schema` + `Runtime`), so a test passes a fake model
  and an in-memory adapter.
- **Tests run without a model.** `GenericFakeChatModel` in node and graph
  tests; real-model checks live in `evals/`, not in `tests/`.
- **Architecture is taught in the notebooks too, the same way as everything
  else:** a cell shows the problem (a node that builds its own model can't be
  tested; budget maths inside a prompt gives a wrong total), then the structure
  that removes it. The notebook says how the structure works; why we chose it
  stays in chat and ADRs.

## What the `langgraph` API should cover

1. **State, nodes, edges** — `StateGraph` over a `TypedDict`; a node is a
   function that reads state and returns a partial update; `START` / `END`;
   reducers (`add_messages`, `operator.add`, `Overwrite`) introduced by
   breaking a list without one first; conditional edge to
   `ask_for_clarification`; the graph drawn as Mermaid.
2. **Model nodes and injected dependencies** — `parse_brief` with structured
   output; `context_schema` / `Runtime` carrying the models and adapters;
   `input_schema` / `output_schema` so callers see only the brief and the
   plan; `RetryPolicy` on a node whose structured output fails to validate.
3. **A tool-calling agent built by hand, as a subgraph** — the hotel search
   agent written as tripgraph's own graph: a model node with `bind_tools`, a
   `ToolNode`, `tools_condition`, the edge back to the model,
   `recursion_limit`. This is project 1's `create_agent` loop rebuilt from
   parts, compared with `hotelbot.build_agent` on the same request. Then it
   runs as a node in the planner: parent and subgraph with different state
   schemas, and the mapping between them.
4. **Fan-out, fan-in, loops** — `Send` launches one `city_research` branch per
   city; results merged by a reducer; timed sequential vs parallel with
   research slow enough (several tool calls per city) that the difference is
   visible. The budget loop: `check_budget` → `trim` → back, with a
   max-iterations guard in state. `Command(goto=..., update=...)` to route from
   inside a node, compared with a conditional edge.
5. **Persistence** — `InMemorySaver`, then `SqliteSaver`; `thread_id`;
   `get_state`, `get_state_history`; quit the CLI mid-plan and resume;
   durability modes; add a field to the state and resume an old thread to see
   what happens to checkpoints saved before the change.
6. **Human in the loop** — `interrupt()` inside `review_draft` with the draft as
   payload; `Command(resume=...)` with approve / edit / reject. **When a run
   resumes, the interrupted node runs again from the top** — a "hold the room"
   call placed before the interrupt runs twice. Fixed with an idempotency key
   in the bookings adapter. Then ADR-0004 carried over: the booking node runs
   only after an approval.
7. **Streaming** — `stream_mode` `"updates"`, `"values"`, `"messages"`,
   `"custom"` (progress events through `get_stream_writer`), and
   `subgraphs=True` to see inside the research branches. These are what the
   CLI renders.
8. **Follow-up edits and time travel** — a follow-up message is classified
   ("swap the Porto hotel" → edit hotels for Porto) and the graph re-runs only
   the affected node via `update_state` + `Command(goto=...)`. Time travel is
   the debugging tool, shown separately: find the checkpoint before a bad
   `pick_activities`, change its input, replay from there, compare the forks.
9. **Multi-agent: supervisor and handoffs** — a supervisor graph routing
   between hotel, activities and budget agents with `Command(goto=...,
   graph=Command.PARENT)`; the same brief through the fixed planner and the
   supervisor, traces compared. When a fixed graph beats a model-routed one,
   and the reverse.
10. **Cost, caching, latency** — a cheap model for parsing and classifying,
    the strong one only for writing the plan; tokens and € per node;
    Anthropic prompt caching on the long static planning prompt (the cached
    tokens column moving); node-level `CachePolicy` so re-running an unchanged
    research branch costs nothing; node `timeout` and `error_handler`.
11. **The production shape** — the same planner in the Functional API
    (`@entrypoint` / `@task`) next to the graph version, same tests passing;
    `langgraph.json`, `langgraph dev`, the graph in LangGraph Studio; the CLI
    switched to talk to the server through `langgraph-sdk` (`RemoteGraph`) —
    client and server, the shape of a deployed agent.
12. **Evaluation: dataset, evaluators, judge** — ~15 briefs with expected
    constraints; code evaluators for budget / cities / no early flights,
    reusing `domain/constraints.py`; an LLM-as-judge for "sensible for the
    stated interests", checked against your own grades to see where it
    disagrees; a trajectory evaluator (did the graph take the expected route,
    did the hotel agent call `check_availability` before proposing); a dataset
    grown from real CLI traces.
13. **Evaluation: regression** — change the planning prompt, run the same
    dataset, compare the two experiments; a pairwise judge for "which plan is
    better"; a small eval gate (`pytest -m eval`) that fails if a key score
    drops — the shape of an eval run in CI.

## AI engineering, spread through the books

| topic | book |
| --- | --- |
| deterministic logic outside the model, unit-tested | 1 |
| dependency injection, fake models, tests with no API key | 2 |
| structured output that fails validation, retries per node | 2 |
| parallelism and latency measured in traces | 4 |
| durable execution, state schema changes vs saved checkpoints | 5 |
| idempotent side effects under resume | 6 |
| streaming UX | 7 |
| model routing, prompt caching, node caching, cost per node | 10 |
| timeouts, error handlers | 10 |
| client / server split, local deployment | 11 |
| offline evals, judge calibration, trajectory evals | 12 |
| regression and pairwise comparison, eval gate | 13 |

## Rough book outline

Each book is sliced before it's built (CLAUDE.md). Book specs fix the cell
outlines; this list only fixes the order.

1. `1-state-nodes-edges` — validate a brief; reducers; clarification edge; `domain/` + first tests; CLI shell.
2. `2-model-nodes` — parse and pick activities with a model; `TripContext`; fake-model tests; retry policy.
3. `3-hotel-agent-by-hand` — the tool loop as a graph; as a subgraph in the planner.
4. `4-fan-out-and-loops` — `Send` per city; budget-trim loop; `Command`.
5. `5-persistence` — SQLite checkpoints, state history, resume after quitting, schema change.
6. `6-human-in-the-loop` — review interrupt, idempotent booking, the approval screen.
7. `7-streaming` — stream modes; the live CLI.
8. `8-follow-ups-and-time-travel` — targeted re-plans; forks.
9. `9-supervisor` — handoffs between agents; fixed vs routed.
10. `10-cost-and-caching` — routing, prompt and node caching, timeouts, `/cost`.
11. `11-production-shape` — Functional API, `langgraph dev`, Studio, CLI over `RemoteGraph`.
12. `12-evals-dataset-and-judge`
13. `13-evals-regression`

## Decisions

- `hotelbot` tools, data and `config.py` model ids are imported, not copied;
  anything new lives in `tripgraph/` (P1 ADR-0006).
- ADR-0002 (local JSON, fixed ISO dates) and ADR-0004 (no booking without
  approval) carry over.
- The hotel agent in book 3 is tripgraph's own graph, not a wrapper around
  `hotelbot.build_agent` — rebuilding the loop from parts is the point.
- Itinerary is city-level; day-level only if the budget loop turns out trivial.
- SQLite for checkpoints (`langgraph-checkpoint-sqlite`); no Postgres.
- New dependencies: `langgraph-checkpoint-sqlite`, `langgraph-cli[inmem]`
  (book 11), `rich` and `prompt_toolkit` (the CLI), `openevals` / `agentevals`
  (books 12–13 — check fit at spec time), `pytest` as a dev dependency.
- `tripgraph.app` is written so project 3 can reuse the shell: it takes a
  compiled graph plus a set of renderers and commands, and knows nothing
  about trips.
