# ADR-0001 — OpenAI as the sole provider

**Status:** Accepted (2025-08-25)

## Context

The project needs embeddings and a chat model with structured output. Mixing
providers means two SDKs, two auth paths, two pricing tables and two sets of
quirks to explain — none of which is the subject being learned.

## Decision

OpenAI for everything. Model ids pinned in `readnext/config.py`, never inline
in a notebook, so a rename is a one-line change.

- Embeddings — `text-embedding-3-small`
- Query understanding, feedback parsing, rerank, explanation — `gpt-5-mini`
- Faithfulness judge, simulated user (eval only) — `gpt-5`

Auth is `OPENAI_API_KEY` in the repo-root `.env` — the name the SDK reads by
default. The older `openai/open-ai-requests.py` in this repo uses `OPEN_AI_API`;
this project does not follow it.

## Consequences

- One SDK, one cost accounting path (`embed.py` and the client wrapper).
- Provider-comparison ablations are out of scope. If that ever matters, the
  `VectorStore` protocol and `PipelineConfig` are the seams to add it behind.
- Model ids and the embedding price constant need confirming before any
  notebook that spends money.

## Alternatives considered

- **Local models (Ollama / sentence-transformers).** Free per call, no key. Cut
  because the subject is RAG technique, not model hosting, and because cost per
  technique is one of the numbers this project reports.
- **Mixed — local embeddings, hosted chat.** Two pricing stories, no teaching
  gain.
