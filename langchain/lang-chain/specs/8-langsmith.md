# Book 8 — LangSmith

**Status:** in progress
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
middleware (`ToolRetryMiddleware`, `ScreenRetrievedText`), driven through
`run()` / `resume()` on one thread.

Unlike books 1–7, this book needs `LANGSMITH_API_KEY`: every cell after the
conversation reads the trace back. Cell 1 stops with a plain message if the
key is missing.

## Module contracts

`hotelbot/catalogue.py` — `check_availability` gains `@traceable(name=
"check_availability.python")` so the pure-Python step shows inside the
tool's run. Nothing else changes; the decorator is a no-op without a key.

`hotelbot/agent.py` — `run()` and `resume()` gain `config: dict | None =
None`, merged into the config they already pass (`thread_id` stays theirs).
Cell 2 uses it for `tags`, `metadata` and `run_id` — the last so the
notebook knows each turn's trace id without searching for it.

`hotelbot/config.py` — adds `PRICING: dict[str, tuple[float, float]]` —
input/output US dollars per million tokens, keyed by the bare model name
LangSmith records (`claude-sonnet-5`, `claude-haiku-4-5-20251001`), as of
the date written. Numbers are a snapshot and say so.

No new tools, prompts or middleware.

## Slices

1. `@traceable`, `run/resume(config=)` — cells 0–3: one conversation and
   its tree in the UI.
2. Tokens from the client — cell 4; no package code.
3. `PRICING` — cell 5.
4. Latency, filtering, the cross-book table, closing — cells 6–8; no
   package code.

## Notebook outline

| # | kind | idea |
| --- | --- | --- |
| 0 | md | title — every call since book 1 has been recorded; this book reads the record |
| 1 | code | `configure_tracing(8)` (stop if no key), `reset_reservations()`, `build_agent(middleware=[ToolRetryMiddleware(...), ScreenRetrievedText()])`, `Client()` |
| 2 | md/code | **One conversation.** Four turns on one thread: search, narrow, policy question, "book it", then `resume` approve. Each call passes `config={"tags": ["book-8", "full-booking"], "metadata": {"guest": "olek"}, "run_id": <new uuid>}`. Each `invoke` is its own trace — five in all; print the URL of each. |
| 3 | md/code | **The tree.** Open the turns. Each trace's top run is the agent; under it the model calls and tool calls as children, in the order the loop made them. Find: `check_availability.python` from `@traceable` inside the `check_availability` tool run; the screening model call inside the `lookup_policy` turn; the turn that ended in an interrupt and the resume trace that finished it. The Threads tab groups all five by `thread_id`. The markdown says what to look for, not what it looks like. |
| 4 | md/code | **Tokens.** `wait_for_all_tracers()` first — runs upload in the background. Then `client.list_runs(project_name="hotelbot-book-8", trace_id=..., run_type="llm")` over the five trace ids — one row per model call: model name, `prompt_tokens`, `completion_tokens`, `total_tokens`. Sum the Sonnet rows and compare with the sum of `usage_metadata` over the thread's `AIMessage`s — same number, two sources. The Haiku rows are the screening calls: the trace sees model calls the conversation never shows. Which turn was most expensive, and why (the one after the policy lookup — the tool result is in the prompt). |
| 5 | md/code | **Cost.** `PRICING` × the per-model token sums; a dollar figure for the whole booking. Then book 1's first question ("Name three cities in Portugal.") asked again here as a direct model call with its own `run_id` — book 1's own trace has expired (see cell 7) — one call vs a four-turn agent conversation. Predict the ratio before computing it. |
| 6 | md/code | **Latency.** Per run, `end_time - start_time`; split model vs tool. Tools are milliseconds, model calls are seconds; each turn's time is roughly the sum of its model calls. The time you took to approve sits between the interrupt trace and the resume trace, in no run at all. |
| 7 | md/code | **Filtering.** `client.list_runs(project_name=..., filter='has(tags, "full-booking")')` and by metadata (`guest`). Then across projects: `hotelbot-book-1` … `-8`, `run_type="llm"`, tokens and cost per book — a small table of how much each book cost to write. Free-plan runs are deleted after about two weeks while the project stays, so the oldest books show zero runs; the markdown says so. |
| 8 | md | closing — the whole project's model use is readable, countable and priced. What the trace doesn't tell you: whether the answer was any good — that needs evaluation, which is the next project's territory. |

## Done when

- Cell 3's tree shows `check_availability.python` nested inside the
  `check_availability` tool run.
- Cell 4's Sonnet token total from `list_runs` equals the `usage_metadata`
  total; the Haiku rows are accounted for as screening calls.
- Cell 5 produces a cost for book 8's conversation and for the repeated
  book 1 question, and the ratio is stated.
- Cell 7's cross-project table has a row per book; expired books show
  zero runs rather than an error.

## Not in this book

Datasets, experiments, evaluators, annotation queues, online evaluation,
dashboards and alerts. Anything that requires a paid LangSmith tier. The
`langsmith` SDK beyond `Client`, `traceable` and `list_runs` (plus
`wait_for_all_tracers`, which only flushes uploads). `list_runs` is
deprecated in langsmith 0.14 in favour of `client.runs.query()` (removal
after 2027-01-31); the notebook silences the warning rather than switching,
since `runs.query` needs project ids and explicit field selection.
