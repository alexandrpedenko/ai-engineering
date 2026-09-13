# ADR-0005 — Retrieval is a tool, not a pre-step

**Status:** Accepted (2026-09-13)

## Context

Classic RAG retrieves on every turn and stuffs the chunks into the prompt.
For a booking assistant most turns are about hotels, not policies; retrieving
"cancellation policy" chunks for "is there a gym" is wasted tokens and a
distraction for the model.

## Decision

Retrieval is exposed as `lookup_policy(question) -> str`, a `@tool` the agent
chooses to call. Inside: `RecursiveCharacterTextSplitter` over
`data/policies/*.md`, `OpenAIEmbeddings`, `InMemoryVectorStore`, top-3 chunks
joined with their source file names. The vector store is rebuilt at import
time (five documents — no cache needed).

## Consequences

- The model has to decide *when* to look something up, which is the
  interesting failure to watch in book 4 (it guesses instead of calling).
- The retrieved text enters the context as a `ToolMessage`, which is exactly
  the channel book 7's injection uses — and the channel a screening
  middleware can inspect.
- No retrieval-quality metrics here; chunking, hybrid search and reranking
  are the read-next project's subject.

## Alternatives considered

- **Retrieve every turn.** Simpler, more tokens, hides the decision.
- **Chroma / a persisted store.** Five files; deferred, `InMemoryVectorStore`
  has the same interface if it ever changes.
