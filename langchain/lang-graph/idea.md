# Project 2 — Trip itinerary planner (`langgraph`)

## Domain and business goal

A workflow that turns a trip brief ("Lisbon and Porto, 5 days, €900 total,
likes food and museums, no early flights") into a day-by-day itinerary with a
hotel per city, a budget breakdown, and a short list of activities. Reuses the
hotel catalogue and `search_hotels` tool from project 1, plus a small
`activities.json` and `transport.json`.

Business goal: produce an itinerary that fits the budget and the stated
constraints, show the user a draft before committing to any booking, and let
them change one part (e.g. "swap the Porto hotel") without redoing the rest.

Why LangGraph and not `create_agent`: parts of this are deterministic (parse
the brief, validate the budget, compute totals) and parts are agentic (pick
activities, write the day plan). A single tool-calling loop either does the
deterministic steps unreliably or hides them; a graph makes each step a node
you can see, test, and re-run.

## What the `langgraph` API should cover

1. **State and nodes** — a `TypedDict` state (`brief`, `cities`, `hotels`,
   `activities`, `budget`, `itinerary`, `messages`); nodes as plain functions
   that read state and return a partial update. Reducers (`add_messages`,
   `operator.add`) shown by breaking something without them first.
2. **Edges and conditional edges** — parse → validate → plan; a conditional
   edge that routes to `ask_for_clarification` when the brief is missing a city
   or budget.
3. **Deterministic vs LLM nodes** — `compute_budget` is pure Python;
   `pick_activities` calls a model with structured output. Both are just nodes.
4. **Fan-out / fan-in with `Send`** — one `research_city` branch per city
   running in parallel, results merged by a reducer. Show the same thing done
   sequentially first and compare the trace.
5. **Loops** — `check_budget` → if over budget, `trim_itinerary` → back to
   `check_budget`, with a max-iterations guard in state.
6. **Tool-calling inside a node** — a `ToolNode` (or a `create_agent` called
   as a subgraph) for the hotel search, so project 1's agent becomes one node in
   a bigger graph.
7. **Persistence** — a checkpointer (in-memory, then SQLite) with `thread_id`;
   stop the kernel mid-run, restart, resume.
8. **Interrupts / human-in-the-loop** — `interrupt()` before `book_hotels`;
   the user reviews the draft and resumes with `Command(resume=...)` carrying
   an approve or an edit.
9. **Time travel** — list checkpoints, go back to the state before
   `pick_activities`, change one value, re-run from there ("swap the Porto
   hotel" without re-planning Lisbon).
10. **Streaming** — `stream_mode="updates"` vs `"values"` vs `"messages"` to
    see node-by-node progress.
11. **Subgraphs** — the per-city research as its own compiled graph, nested in
    the main one.
12. **Cost & latency** — a `route_model` step: a cheap model classifies the
    brief and handles clarification, the strong model only writes the plan.
    Compare cost and latency per run in LangSmith before and after; count
    tokens per node; turn on prompt caching for the long static part of the
    planning prompt and see the cached-token column move.
13. **Evaluation** — the core skill, done properly:
    - a dataset of ~15 briefs with expected constraints (budget met, cities
      covered, no early flights);
    - code evaluators for the checkable things, an LLM-as-judge evaluator for
      "is this itinerary sensible for the stated interests", with a look at
      where the judge disagrees with you;
    - a dataset built from real traces (run the graph, annotate, add to
      dataset);
    - a regression: change the planning prompt, run the same dataset, compare
      the two experiments side by side. This is what "did my change help" looks
      like when you can't read every output.

## Rough notebook outline

- `01_state_nodes_edges.ipynb` — the smallest graph: parse → validate → END,
  reducers, conditional edge to clarification.
- `02_llm_nodes_and_tools.ipynb` — structured-output node, hotel search as a
  `ToolNode`, project 1's agent as a subgraph.
- `03_fan_out_and_loops.ipynb` — `Send` per city, the budget-trim loop.
- `04_persistence_and_interrupts.ipynb` — checkpointer, resume, `interrupt()`
  before booking, `Command(resume=...)`.
- `05_time_travel_and_streaming.ipynb` — edit a past checkpoint and replay;
  stream modes.
- `06_model_routing_and_cost.ipynb` — cheap/strong routing, token counts,
  prompt caching, cost per run.
- `07_evals_dataset_and_judge.ipynb` — dataset of briefs, code evaluators,
  LLM-as-judge, dataset from traces.
- `08_evals_regression.ipynb` — two prompt versions on the same dataset,
  experiments compared.

A `tripgraph/` package holds state definitions, nodes and the compiled graphs.

## Decisions

- Import `hotelbot` tools and data from project 1 rather than re-implement;
  anything new to this project (activities, transport, state, nodes) lives in
  `tripgraph/`.
- Itinerary is city-level to start; add day-level only if the budget-trim loop
  turns out trivial.
- SQLite checkpointer; skip Postgres.
