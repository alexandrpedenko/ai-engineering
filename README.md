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

## Running it

```bash
pipenv install --dev
pipenv shell
```

Requires Python 3.14 and an `ANTHROPIC_API_KEY` in a `.env` file at the repo root
(loaded via `python-dotenv`). Open the notebooks in VS Code or Jupyter and run them
top to bottom; notebooks 9 and 10 use `claude-sonnet-5` as the coordinator and
`claude-haiku-4-5` for the sub-agents.

Tests for the standalone examples:

```bash
pipenv run pytest claude/tests
```
