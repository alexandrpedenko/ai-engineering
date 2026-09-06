# ADR-0004 — Brute-force search behind a `VectorStore` protocol

**Status:** Accepted (2025-08-29) — implemented in notebook 3

## Context

The reflex at this point is to reach for a vector database. At ~12k chunk
vectors, a full dot product over one numpy matrix takes single-digit
milliseconds — a database would add a dependency, a schema and an index-tuning
story while answering a question nobody has yet.

But later notebooks add BM25, filters, and fusion, and they must not require
rewriting every call site.

## Decision

`NumpyStore` — one matrix, `argsort` over a dot product, vectors assumed
normalized so the dot product *is* cosine similarity. It sits behind a
`VectorStore` Protocol with `add()` and `search(vector, k, where)`.

`where` is in the signature from day one even though filtering isn't used until
notebook 6, so the protocol's shape never changes.

## Consequences

- No vector DB dependency, and search is exact — no recall lost to an
  approximate index, so any recall number is the retriever's fault and not the
  index's.
- Everything downstream talks to the store, never to `chunks` or `vectors`.
- The index is rebuilt in memory each session from the embedding cache; it is
  gitignored and derived.
- Won't survive a corpus 100× larger. That is a known and accepted ceiling.

## Alternatives considered

- **sqlite-vec / Chroma / FAISS.** Real answers at a scale this project does not
  reach. Deferred; the protocol is the seam if it ever changes.
