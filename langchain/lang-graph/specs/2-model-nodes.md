# Book 2 — model nodes

**Status:** spec drafted
**Decides:** ADR-0003 (dependencies through `TripContext`), ADR-0006 (tests
never call a model; `ScriptedModel`), ADR-0007 (the first eval), ADR-0008
(relative dates against a fixed today)
**Written against:** `langgraph` 1.2.11, `langchain` 1.4.0, `langchain-core`
1.6.6, `langchain-anthropic` 1.7.2, `langsmith` 0.14.4 (installed 2026-10-11)

## What you can do after this that you couldn't before

Put a model inside a node and still test that node with no API key. Give
nodes what they depend on through the graph's context instead of building it
inside them. Make a node retry when the model's output doesn't fit the
schema. Type a trip brief in plain words, including "this Saturday for 5
nights", and get the night split back. Measure how often the parsing is
right, field by field, and how much the answer changes between runs.

## Builds on

Book 1's planner, state, rules and CLI. `read_brief` (JSON only) is replaced
in the planner by `parse_brief` (a model). The rest of the graph doesn't
change. Project 1's `with_structured_output` (book 3) and LangSmith
experiments (book 8) are used again here, now inside a graph.

## Checked against the installed packages

- `StateGraph(state, context_schema=...)`; a node declared as
  `(state, runtime: Runtime[TripContext])` gets the context as
  `runtime.context`; `invoke(input, context=ctx)` passes it.
- `ChatAnthropic.with_structured_output` defaults to `method="function_calling"`:
  the schema is offered to the model as a tool, and `PydanticToolsParser`
  turns the tool call's arguments into the Pydantic object. Arguments that
  don't fit raise `pydantic.ValidationError`.
- `GenericFakeChatModel` raises `NotImplementedError` on `bind_tools` and
  `with_structured_output`. A subclass that pipes itself into the same
  `PydanticToolsParser` gives a real `TripBrief`, or a real
  `ValidationError` for bad arguments.
- `RetryPolicy()`'s default `retry_on` does not retry `ValueError`, and
  `ValidationError` is a `ValueError`. With the default policy, a bad output
  fails after 1 attempt. With `retry_on=ValidationError`, it succeeds on
  attempt 2.
- With no `ANTHROPIC_API_KEY`, `init_chat_model("anthropic:...")` builds the
  model; the call itself raises `TypeError` ("authentication failed").
- `langsmith.evaluate` takes `num_repetitions`. `openevals` and `agentevals`
  are not installed and not needed: the `parse` evaluators are field
  comparisons in plain code.

## Module contracts

`tripgraph/config.py` — added:

```python
from hotelbot.config import CHAT_MODEL, CHEAP_MODEL   # model ids are shared with project 1
TODAY = "2026-10-05"                                   # a Monday; ADR-0008
def configure_tracing(book: int | str) -> None         # "cli" -> project "tripgraph-cli"
```

`tripgraph/llm.py`

```python
ROLE_MODELS = {"parse": CHAT_MODEL}       # book 10 moves parse to CHEAP_MODEL
def chat_model(role: str) -> BaseChatModel # init_chat_model(ROLE_MODELS[role]); KeyError for an unknown role
```

`tripgraph/context.py` (ADR-0003)

```python
@dataclass
class ModelRoles:
    parse: BaseChatModel                   # later books add a field per role

@dataclass
class TripContext:
    models: ModelRoles
    today: str = TODAY                     # ISO date; ADR-0008

def make_context(**overrides) -> TripContext
# real models from llm.chat_model; each keyword replaces one field:
# make_context(today="2026-12-01"), make_context(models=ModelRoles(parse=fake))
```

Only the fields book 2 uses. `spec.md`'s adapters and `guest` arrive with
the books that use them.

`tripgraph/nodes/parse.py`

```python
PARSE_PROMPT: str
# system message; {today} and {weekday} are filled per run. Rules, in plain words:
#   only what the text states; anything not stated stays empty (null or []);
#   cities: named cities only, in the order given; a country or region is not a city;
#   dates: ISO; resolve a phrase that names a day against today, and a day plus a
#     length ("for 5 nights", "for a week"); day and month without a year = the next
#     one on or after today; a period with no day ("next week", "in October") -> empty;
#   budget: the total in euros for the whole trip; per person or another currency -> empty;
#   travellers: how many people; 1 if not said.

parse_brief(state, runtime: Runtime[TripContext]) -> {"brief": TripBrief}
# last human message + PARSE_PROMPT -> runtime.context.models.parse.with_structured_output(TripBrief).
# Reads only the last human message, as read_brief did. A ValidationError is not caught:
# the planner's retry policy handles it.
```

`nodes/read.py` stays in the package: book 1's notebook uses it. The planner
no longer does.

`tripgraph/testing.py` (ADR-0006)

```python
class ScriptedModel(GenericFakeChatModel):
    # messages: an iterator of AIMessage, handed out one per call, in order.
    calls: list[list[BaseMessage]]           # what each call was given, for tests to inspect
    bind_tools(tools, **kw) -> self          # used from book 3
    with_structured_output(schema, **kw) -> self | PydanticToolsParser(tools=[schema], first_tool_only=True)

def tool_call(name: str, args: dict) -> AIMessage   # an AIMessage holding one tool call
def scripted(*replies: AIMessage | dict) -> ScriptedModel
# a dict is short for tool_call("TripBrief", the dict)
```

`tripgraph/graphs/planner.py` — changed:

```python
PARSE_RETRY = RetryPolicy(max_attempts=3, retry_on=ValidationError)

build_planner(checkpointer=None) -> CompiledStateGraph
# StateGraph(PlannerState, context_schema=TripContext)
# START -> parse_brief (retry_policy=PARSE_RETRY) -> validate_brief -> route_after_validate
#   -> ask_for_clarification -> END | confirm_brief -> END

plan(graph, text, ctx, thread_id=None) -> PlannerResult   # ctx is now required; invoke(..., context=ctx)
```

API errors (rate limits, overload) are retried by the Anthropic client itself
(`max_retries`), so `PARSE_RETRY` names only `ValidationError`.

`tripgraph/app/` and `__main__.py` — changed:

```python
# __main__.py: configure_tracing("cli"); run_shell(build_planner(), renderer=TripRenderer(today=TODAY),
#              commands={"example": example_command}, make_ctx=make_context)
# /example [n] prints sample brief n from data/briefs/ (default 1) and how many there are
# TripRenderer(console=None, today=None): welcome() says "Today is Monday, 2026-10-05" when today is set
```

`data/briefs/*.txt` — one brief per file, plain language, all against
today = 2026-10-05 (Monday). Cities are the four in the hotel data.

| file | text | expected |
| --- | --- | --- |
| `01-complete.txt` | Lisbon and Porto from 2026-10-10 to 2026-10-15, €900 for the whole trip. I like food and museums. | Lisbon, Porto · 10-10 → 10-15 · 900 · 1 · complete |
| `02-this-saturday.txt` | Porto then Lisbon, leaving this Saturday for 5 nights. Budget 1200 euros, two of us. | Porto, Lisbon · 10-10 → 10-15 · 1200 · 2 · complete |
| `03-day-of-month.txt` | Madrid from the 20th to the 24th, 600 euros, mostly art galleries. | Madrid · 10-20 → 10-24 · 600 · 1 · complete |
| `04-next-monday.txt` | Seville next Monday for a week, €1000 total, me and my partner. We love flamenco. | Seville · 10-12 → 10-19 · 1000 · 2 · complete |
| `05-next-week.txt` | Lisbon and Porto next week, about 900 euros. | Lisbon, Porto · — · 900 · 1 · missing start, end |
| `06-no-budget.txt` | Seville 2026-10-14 to 2026-10-17, tapas and flamenco. | Seville · 10-14 → 10-17 · — · 1 · missing budget |
| `07-no-city.txt` | Somewhere sunny in Portugal from 2026-10-10 to 2026-10-15, €700. | — · 10-10 → 10-15 · 700 · 1 · missing cities |
| `08-too-few-nights.txt` | Lisbon, Porto and Madrid from 2026-10-10 to 2026-10-12, €800. | 3 cities · 10-10 → 10-12 · 800 · 1 · too_few_nights |
| `09-month-name.txt` | Porto from October 22 to October 25, 500 EUR, no trains before 9am. | Porto · 10-22 → 10-25 · 500 · 1 · complete |
| `10-per-person.txt` | Lisbon 2026-10-10 to 2026-10-13, €300 each, two travellers. | Lisbon · 10-10 → 10-13 · — · 2 · missing budget |
| `11-json.txt` | book 1's `COMPLETE` as JSON | as `01` |

`evals/` (ADR-0007) — at `langchain/lang-graph/evals/`, outside the package,
run from `langchain/lang-graph/`:

```
evals/datasets/parse.jsonl
# line 1: {"dataset": "parse", "version": 1}
# then one row per data/briefs file:
# {"inputs": {"text": ..., "today": "2026-10-05"},
#  "outputs": {"brief": {cities, start, end, budget, travellers}, "missing": [...]},
#  "metadata": {"file": "02-this-saturday.txt"}}

evals/evaluators.py   # plain functions (outputs, reference_outputs) -> {"key", "score": 0 | 1}
cities      # same cities, same order, ignoring case
start, end  # equal ISO strings (both None counts as equal)
budget      # equal to the cent (both None counts as equal)
travellers
missing     # missing_fields(parsed brief) == expected missing
# interests, amenities and earliest_departure are not scored: their wording varies.

evals/run.py
# python evals/run.py parse [--repetitions 3] [--local]
# uploads the dataset as "tripgraph-parse-v1" if LangSmith doesn't have it;
# target: {"text", "today"} -> parse_brief alone with make_context(today=today);
# langsmith.evaluate(..., num_repetitions=..., experiment_prefix="parse",
#                    upload_results=not local);
# prints accuracy per field, how many examples gave the same brief in every
# repetition, mean latency, and total tokens.
```

`pyproject.toml` — `[tool.pytest.ini_options]` gains `pythonpath = ["."]` so
`tests/evals/` can import `evals`.

## Tests

All run with no API key (ADR-0006).

- `tests/test_testing.py` — `ScriptedModel` gives text replies in order;
  `with_structured_output(TripBrief)` turns a scripted tool call into a
  `TripBrief`; arguments that don't fit raise `ValidationError`;
  `bind_tools` returns the same model; `calls` records what each call was
  given.
- `tests/nodes/test_parse.py` — `parse_brief` returns the scripted brief; the
  system message holds "Today is Monday, 2026-10-05", and changes with
  `today`; only the last human message is sent.
- `tests/graphs/test_planner.py` — rewritten over `ScriptedModel`: a complete
  brief gets the split; a brief without dates asks for both; a bad first
  output and a good second one end in the split, with two calls made; three
  bad outputs raise `ValidationError`.
- `tests/app/test_shell.py` — the shell tests run the planner with
  `make_ctx` returning a scripted context.
- `tests/evals/test_dataset.py` — every row's expected `missing` equals
  `missing_fields` of its expected brief; every row's text is the text of its
  `data/briefs/` file; each evaluator scores 1 on a match and 0 on a miss.

## Slices

1. **Models and structured output** — `config.py` additions, `llm.py`;
   cells 0–3.
2. **The context** — `context.py`, `nodes/parse.py`; cells 4–6.
3. **A fake model** — `testing.py`, `tests/test_testing.py`,
   `tests/nodes/test_parse.py`; cells 7–8.
4. **Today, retries and the planner** — `graphs/planner.py` (`parse_brief`
   in, `PARSE_RETRY`, `context_schema`, `plan` takes `ctx`), `__main__.py`
   passes `make_ctx`; `tests/graphs/` and `tests/app/` moved to
   `ScriptedModel`; cells 9–10.
5. **Text in, brief out, and the CLI** — `data/briefs/`, `/example [n]`,
   `TripRenderer(today=...)`, tracing from the CLI; cells 11–13.
6. **The `parse` eval** — `evals/`, `tests/evals/`, the `pythonpath` line;
   cells 14–17.

Slice 4 replaces `read_brief` in the planner, so it moves every test that
runs the planner to the fake model in the same slice; nothing is left red.

## Notebook outline

`2-model-nodes.ipynb`. Two texts reused throughout: `TEXT` = brief `01`, and
`SATURDAY` = brief `02`. Live model calls are in cells 2, 3, 4, 6, 9, 12 and
15; everything else runs with no API key.

| # | kind | idea |
| --- | --- | --- |
| 0 | md | title — book 1's planner reads only JSON; this book puts a model in a node to read words, keeps that node testable without a model, and measures how often it reads right |
| 1 | code | `configure_tracing(2)`; imports |
| 2 | md/code | **A model answers in text.** `chat_model("parse").invoke(TEXT)`: a helpful paragraph. `missing_fields` needs a `TripBrief`, not a paragraph. |
| 3 | md/code | **Structured output.** `with_structured_output(TripBrief)`: the schema is offered as a tool, the model "calls" it, and the arguments become a `TripBrief`. The tool as the model sees it (`convert_to_openai_tool(TripBrief)`, name and fields). Predict `missing_fields` for `TEXT` and for "Lisbon and Porto next week, about 900 euros". |
| 4 | md/code | **A node that calls a model is still a node.** `parse_v1(state)`, written in the cell, builds its own model and returns `{"brief": ...}`. Book 1's wiring with `parse_v1` in place of `read_brief`; `TEXT` runs through. |
| 5 | md/code | **Try to test it.** A test should pass with no API key and give the same answer every run. The test for `parse_v1`, run with the key hidden (`patch.dict(os.environ, ...)`): `TypeError`, authentication failed. The model is made inside the function, so there is no way to hand it another one. |
| 6 | md/code | **Dependencies through the context.** `TripContext`; `StateGraph(PlannerState, context_schema=TripContext)`; a node declared `(state, runtime)` reads `runtime.context.models.parse`; `invoke(..., context=make_context())`. The context is not part of the state: the result has book 1's three keys. |
| 7 | md/code | **A fake model.** `GenericFakeChatModel` hands out scripted replies in order, shown with two text replies. Its `with_structured_output` raises `NotImplementedError`. `ScriptedModel` adds the same parser the real model uses. A context holding a `ScriptedModel`: `parse_brief` returns exactly the scripted brief, with no API key. Predict the brief. |
| 8 | md/code | **The node's test.** Print one test from `tests/nodes/test_parse.py`; `!pytest tests -q`. |
| 9 | md/code | **What day is it?** `SATURDAY` needs a today to mean anything. `PARSE_PROMPT` filled for 2026-10-05; the weekday as `date.strftime("%A")`. `SATURDAY` parsed with today 2026-10-05, then 2026-12-01 (a Tuesday): predict both pairs of dates (10-10 → 10-15; 12-05 → 12-10). Then "next week": predict `start`. |
| 10 | md/code | **When the output doesn't fit.** A `ScriptedModel` whose first reply has `budget: "lots"`, then a good one. Through a one-node graph with no policy: `ValidationError`. With `RetryPolicy()`: still 1 attempt. `issubclass(ValidationError, ValueError)` and the default `retry_on` that skips `ValueError`, shown as numbers. With `retry_on=ValidationError`: 2 attempts, the good brief. Predict the attempt count each time. |
| 11 | md/code | **Text in, brief out.** A small graph with `input_schema` (`text`), `output_schema` (`brief`) and an internal state holding `messages`: `invoke({"text": ...})` returns only `{"brief": ...}`. What a caller has to send and gets back, separate from what the nodes pass around. |
| 12 | md/code | **The planner reads words.** `build_planner()` now starts with `parse_brief`. `plan(graph, text, make_context())` over briefs `01`, `05` and `07`; predict which ones get questions. |
| 13 | md | **Talk to it.** `pipenv run python -m tripgraph`. The welcome names today. Things to try: `/example 2`, "Lisbon and Porto next week, about 900 euros" (asks for dates only), a brief of your own with "this Saturday", the book 1 JSON (still works). The trace is in the `tripgraph-cli` project. |
| 14 | md/code | **Is it right? A dataset and evaluators.** A *dataset* is inputs with the answers you expect; an *evaluator* scores one output against its expected answer; an *experiment* is one run of a target over a dataset. Row `02` printed; the evaluators called by hand on a correct and a wrong parse (no model). |
| 15 | md/code | **Run it three times.** The same text through the real model three times may not give the same brief. `!python evals/run.py parse --repetitions 3`. Predict first: which field scores lowest? |
| 16 | md | **Reading the experiment.** In LangSmith: per-field columns, the three repetitions of one row side by side, latency and tokens. What a failing row looks like and how to open its trace. |
| 17 | md | closing — a model in a node, its dependencies in the context, tested with a scripted model, retried when its output doesn't fit, and measured by an eval. The planner still stops after checking the brief; book 3 builds the hotel agent that the complete branch will call. |

## Done when

- `pytest` passes from `langchain/lang-graph/` with no API key.
- Cell 5 shows the `TypeError`; cell 7 parses with no API key.
- Cell 9: `SATURDAY` gives 2026-10-10 → 2026-10-15 with today 2026-10-05,
  and 2026-12-05 → 2026-12-10 with today 2026-12-01; "next week" leaves
  `start` empty.
- Cell 10: 1 attempt with no policy and with `RetryPolicy()`; 2 with
  `retry_on=ValidationError`.
- In the terminal: brief `01` gives the night split; "Lisbon and Porto next
  week, about 900 euros" asks for the two dates only.
- `python evals/run.py parse --repetitions 3` prints accuracy per field and
  agreement across repetitions, and the experiment is in LangSmith.

## Effect on book 1

- `tests/graphs/` and `tests/app/` change in slice 4: they now script the
  model instead of sending JSON to `read_brief`.
- Book 1's notebook keeps working: its hand-built graphs import `read_brief`,
  which stays. Its last code cell draws `build_planner()`, which from slice 4
  shows `parse_brief` in the first box. That cell's text calls it "the same
  wiring", which will no longer be exact. The notebook is not edited.

## Not in this book

Tools and `bind_tools` (book 3). Answering a question so it fills the earlier
brief — each line is still a separate run (book 5). The cheap model (book
10). An LLM judge, `openevals`, `agentevals` (books 3 and 13). Budgets per
person and other currencies — left empty, so the brief asks.
