# ADR-0008 — Chroma, persisted to disk, for the policy index

**Status:** Accepted (2026-09-14). Supersedes the storage choice in
[ADR-0005](0005-rag-is-a-tool.md); ADR-0005's decision that retrieval is a
tool, not a pre-step, still stands.

## Context

ADR-0005 picked `InMemoryVectorStore`, rebuilt at import time, and explicitly
deferred Chroma as unnecessary for five documents. That is still true for
book 4 on its own. It stops being true once project 3 reuses the same index
inside a `policy_expert` sub-agent (deep-agents/idea.md item 8): a sub-agent
that re-embeds five documents on every session start is paying an
avoidable cost, and ADR-0002's data files are otherwise all committed and
inspectable — an in-memory index that vanishes with the kernel is the odd
one out.

## Decision

`lookup_policy` builds its index with `langchain_chroma.Chroma` using a
persistent client pointed at `data/chroma/`. The collection is built once
(a small `hotelbot/index.py` helper: build-if-missing, keyed on the
policy file names) and reused on later imports instead of re-embedding.
Splitting (`RecursiveCharacterTextSplitter`), embeddings
(`OpenAIEmbeddings`), and the top-3-chunks-joined return shape are
unchanged from ADR-0005 — only the store class and its persistence change.
Project 3's `policy_expert` sub-agent points at the same `data/chroma/`
directory rather than rebuilding it.

## Consequences

- `data/chroma/` is a new directory of binary/SQLite index files, not
  human-readable like the rest of `data/` (ADR-0002) — it is committed as a
  built artifact, not hand-edited, and can always be regenerated from
  `data/policies/*.md`.
- Book 4 gains one extra step over ADR-0005's plan: showing the index build
  once, then showing that a second import reuses it instead of re-embedding
  (a natural place to talk about why persistence matters, not just how).
- `chromadb` / `langchain-chroma` joins the Pipfile dependency list.
- Book 7's injected `loyalty.md` still flows through the same
  `lookup_policy` tool; the persisted index needs a rebuild step in that
  notebook when the poisoned document is added, since it is not part of the
  original build.
- Project 3 no longer needs its own copy of the retrieval setup for the
  `policy_expert` sub-agent — it opens the same Chroma directory.

## Alternatives considered

- **Keep `InMemoryVectorStore` (ADR-0005's original choice).** Simplest,
  but re-embeds five documents every session across every project that
  reuses it, and leaves no artifact on disk to inspect.
- **Pinecone or another hosted vector DB.** Adds a third API key and a
  network dependency for a five-document corpus; nothing in any of the
  three projects needs cross-machine sharing or scale that a local store
  can't give.
- **FAISS.** Also local and persistent, but Chroma's API is closer to what
  `InMemoryVectorStore` already looks like (`add_documents`,
  `similarity_search`) and ships a persistent client with less setup code,
  so the book 4 diff from ADR-0005's original plan stays small.
