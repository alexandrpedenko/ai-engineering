# ADR-0001 — Anthropic for chat, OpenAI for embeddings

**Status:** Accepted (2026-09-13)

## Context

The repo already has an `ANTHROPIC_API_KEY` (shop assistant) and an
`OPENAI_API_KEY` (read-next). LangChain's point is that the provider is a
string; picking one provider for everything would hide that.

Anthropic has no embeddings endpoint, so a retrieval book needs a second
provider anyway.

## Decision

Chat and agent calls go through `init_chat_model("anthropic:<id>")`.
Embeddings go through `langchain_openai.OpenAIEmbeddings("text-embedding-3-small")`.
Model ids live in `hotelbot/config.py` and nowhere else.

## Consequences

- Book 1 shows the provider switch once (`"anthropic:…"` → `"openai:…"`,
  same code) and then never mentions it again.
- Two keys required to run book 4 onward; books 1–3 need only Anthropic.
- Cost and latency numbers in book 8 are Anthropic's; comparing providers is
  not a goal of this project.

## Alternatives considered

- **One provider.** Simpler `.env`, but loses the one lesson the abstraction
  exists for.
- **Local embeddings (sentence-transformers).** No second key, but a heavy
  dependency for five documents, and read-next already uses the OpenAI model.
