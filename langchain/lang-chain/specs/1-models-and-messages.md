# Book 1 — models and messages

**Status:** next
**Decides:** ADR-0001 (providers), ADR-0007 (tracing from cell one)

## What you can do after this that you couldn't before

Call a chat model through LangChain, read what comes back as typed messages,
stream it, and open the trace of that call in LangSmith. No tools, no agent —
the model answers from the system prompt alone.

## Builds on

Nothing in this project. Assumes the shop-assistant project's familiarity with
"a model call takes messages and returns a message".

## Module contracts

`hotelbot/config.py`

```python
CHAT_MODEL = "anthropic:claude-sonnet-5"
CHEAP_MODEL = "anthropic:claude-haiku-4-5-20251001"
EMBEDDING_MODEL = "text-embedding-3-small"
DATA_DIR: Path
TODAY = "2026-09-13"                       # fixed, ADR-0002
def configure_tracing(book: int) -> None   # sets LANGSMITH_* env, warns if no key
```

`hotelbot/models.py` — only `Hotel` this book (needed for the system-prompt
demo of "the model can't see the catalogue").

Nothing else is promoted from this book; there is no agent yet.

## Notebook outline

| # | kind | idea |
| --- | --- | --- |
| 0 | md | title — what LangChain adds on top of a raw SDK call, and what this project builds |
| 1 | code | `configure_tracing(1)`, load `.env`, one `init_chat_model(CHAT_MODEL)` |
| 2 | md/code | **One call.** `model.invoke("...")` with a plain string; look at the `AIMessage`: `.content`, `.response_metadata` (tokens, stop reason), `.id`. Link to the trace. |
| 3 | md/code | **Messages have roles.** `SystemMessage` + `HumanMessage`; the same question with and without a system prompt that says "you are a hotel booking assistant for Lisbon/Porto/Madrid/Seville" — the answer changes shape |
| 4 | md/code | **The model can't see your data.** Ask for "a hotel in Alfama under €150"; it invents one. Predict first: will it refuse, hedge, or invent? This is the gap tools close in book 2. |
| 5 | md/code | **A conversation is a list.** Append the `AIMessage`, add a follow-up `HumanMessage`, call again; the model "remembers" only because the list was resent. Count tokens per call from `usage_metadata` — the list grows, the cost grows. |
| 6 | md/code | **Streaming.** `for chunk in model.stream(...)` — chunks are `AIMessageChunk`s, `+` concatenates them into one message; print as they arrive |
| 7 | md/code | **The provider is a string.** Same messages through `init_chat_model("openai:gpt-5-mini")` — nothing else changes. One call, then back to Anthropic for the rest of the project. |
| 8 | md | closing — you can call and stream a model and read its metadata; it doesn't know the catalogue and doesn't remember anything you don't resend. Book 2 gives it hands (tools); book 5 gives it memory. |

## Done when

- `configure_tracing(1)` works with and without a LangSmith key.
- Cell 4 visibly invents a hotel.
- Cell 5 shows token count rising across turns.
- Streaming prints incrementally in the notebook.

## Not in this book

Tools, `create_agent`, structured output, any file under `data/` except the
one `Hotel` record used to make cell 4's point. Prompt wording is whatever
makes the cells work — iterating it is book 6.
