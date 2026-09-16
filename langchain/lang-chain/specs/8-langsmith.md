# Book 8 — LangSmith

**Status:** draft
**Decides:** nothing new; closes ADR-0007 (tracing on from cell one)

## What you can do after this that you couldn't before

Read a trace the way you'd read a log: one full booking conversation,
every model call and tool call, what each cost in tokens, time and money,
and where the interrupt sat. Pull the same numbers with the client instead
of the UI. Put your own function into the trace.

Seven books of traces already exist; this book is where you go back and
look at them.

## Builds on

All of it — the agent used here is `build_agent()` with book 7's opt-in
middleware, running book 6's `REQUESTS`.

## Module contracts

`hotelbot/catalogue.py` — `check_availability` gains `@traceable(name=
"check_availability.python")` so the pure-Python step shows inside the
tool's run. Nothing else changes; the decorator is a no-op without a key.

`hotelbot/config.py` — adds `PRICING: dict[str, tuple[float, float]]` —
input/output price per million tokens for the two chat models, as of the
date written, for cell 5's cost sum. Numbers are a snapshot and say so.

No new tools, prompts or middleware.

## Notebook outline

| # | kind | idea |
| --- | --- | --- |
| 0 | md | title — every call since book 1 has been recorded; this book reads the record |
| 1 | code | `configure_tracing(8)`, `reset_reservations()`, `build_agent(middleware=[ToolRetryMiddleware(...), ScreenRetrievedText()])`, `Client()` |
| 2 | md/code | **One conversation.** Four turns on one thread: search, narrow, policy question, "book it", then `resume` approve. Tag the run: `config={"tags": ["book-8", "full-booking"], "metadata": {"guest": "olek"}}`. Print the LangSmith URL of the top run. |
| 3 | md/code | **The tree.** Open it. Top: one run per turn. Under each: the model calls and the tool calls as children, nested in the order the loop made them. Find: the `lookup_policy` call and its child `check_availability.python` from `@traceable`; the turn that ended in an interrupt and the resumed run that finished it. A screenshot-worthy cell; the markdown says what to look for, not what it looks like. |
| 4 | md/code | **Tokens.** `client.list_runs(project_name="hotelbot-book-8", run_type="llm")` — one row per model call: `prompt_tokens`, `completion_tokens`, `total_tokens`. Sum them. Compare with the sum of `usage_metadata` over the conversation's `AIMessage`s — same number, two sources. Which turn was most expensive, and why (the one after the policy lookup — the tool result is in the prompt). |
| 5 | md/code | **Cost.** `PRICING` × the per-model token sums; a number in euros for the whole booking. Then the same for book 1's project (`hotelbot-book-1`) — one call with no tools vs a four-turn agent conversation. Predict the ratio before computing it. |
| 6 | md/code | **Latency.** Per run, `end_time - start_time`; split model vs tool. Tools are milliseconds, model calls are seconds; the conversation's wall time is roughly the sum of its model calls plus the time the interrupt waited for you. |
| 7 | md/code | **Filtering.** `client.list_runs(project_name=..., filter='has(tags, "full-booking")')` and by metadata. Then across projects: `hotelbot-book-*`, model runs per book — a small table of how much each book cost to write. |
| 8 | md | closing — the whole project's model use is readable, countable and priced. What the trace doesn't tell you: whether the answer was any good — that needs evaluation, which is the next project's territory. |

## Done when

- Cell 3's tree shows `check_availability.python` nested inside the
  `check_availability` tool run.
- Cell 4's two token totals agree.
- Cell 5 produces a cost for book 8's conversation and for book 1's single
  call, and the ratio is stated.
- Cell 7's cross-project table has a row per book with tracing enabled.

## Not in this book

Datasets, experiments, evaluators, annotation queues, online evaluation,
dashboards and alerts. Anything that requires a paid LangSmith tier. The
`langsmith` SDK beyond `Client`, `traceable` and `list_runs`.
