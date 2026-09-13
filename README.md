# ai-bootcamp

A personal study repo for AI engineering. It's a workbench, not a library: notebooks,
small scripts and one end-to-end project, written while learning how LLM-based systems
are actually built — prompting, tool use, validation, agentic loops, multi-agent
delegation and runtime enforcement.

Everything here is exploratory. Code is optimised for being read and re-run, not for
reuse in production.

## Layout

| Path | What's in it |
| --- | --- |
| [claude/shop-assistant-project/](claude/shop-assistant-project/) | The main project — a customer-support agent built up over 10 notebooks |
| [claude/docs_examples/](claude/docs_examples/) | Standalone snippets from the Anthropic docs (stop reasons, orchestrator/workers, human-in-the-loop, rollbacks) |
| [claude/tests/](claude/tests/) | pytest checks for the example scripts |
| [openai/read-next-project/](openai/read-next-project/) | Second project — an arXiv paper recommender on a RAG stack, in progress (4 of 9 books built) |
| [openai/](openai/) | Early OpenAI API experiments |
| [pandas-gists/](pandas-gists/) | Pandas practice — groups, masks, locs, missing values, time series |

## The shop assistant project

Built while studying Claude: a support assistant for a fictional online shop, grown
over 10 notebooks from a single API call into a hub-and-spoke multi-agent system —
tool use, schema and semantic validation, action tools with case state, an agentic
loop, a coordinator delegating to isolated read-only sub-agents, and a hook layer that
enforces "no sub-agent may write" and "no card number reaches a context" at runtime.

Full breakdown of every notebook, module and data file:
[claude/shop-assistant-project/index.md](claude/shop-assistant-project/index.md).

## The read-next project

Built while studying the OpenAI stack: a paper recommender over ~1,700 committed arXiv
abstracts, planned as 9 notebooks. Books 1–4 are built — fetching and chunking the
corpus, batched embeddings with an on-disk cache, a brute-force vector store behind a
protocol, and a notebook app with clickable cards whose 👍/👎 clicks move a per-user
taste vector and land in an event log meant to serve as the test set. Books 5–9 (click
metrics and replay, an LLM query front door, BM25 hybrid search, LLM rerank and
grounded explanations, simulated-persona evaluation) are specced, not built.

Architecture and decisions: [openai/read-next-project/spec.md](openai/read-next-project/spec.md).

## Running it

```bash
pipenv install --dev
pipenv shell
```

Requires Python 3.14 and an `ANTHROPIC_API_KEY` (shop assistant) and `OPENAI_API_KEY`
(read-next) in a `.env` file at the repo root (loaded via `python-dotenv`). Open the notebooks in VS Code or Jupyter and run them
top to bottom; notebooks 9 and 10 use `claude-sonnet-5` as the coordinator and
`claude-haiku-4-5` for the sub-agents.

Tests for the standalone examples:

```bash
pipenv run pytest claude/tests
```
