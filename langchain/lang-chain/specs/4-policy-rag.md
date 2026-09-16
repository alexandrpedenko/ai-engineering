# Book 4 — policy RAG

**Status:** draft
**Decides:** ADR-0005 (retrieval is a tool), ADR-0008 (Chroma, persisted), ADR-0001 (OpenAI embeddings)

## What you can do after this that you couldn't before

Give the agent five policy documents it can consult. Split them, turn the
pieces into numbers, store the numbers so a question can find the nearest
pieces, and wrap that lookup as a tool the agent decides to call — or,
tellingly, decides not to.

## Builds on

Book 3: `build_agent()` / `run()`. Book 1: the model invents what it doesn't
know — here it invents policy instead of hotels.

Readers of the read-next project have seen chunking and embeddings before;
this book re-derives them briefly rather than assuming that.

## Module contracts

`data/policies/` — five markdown files, 3–6 paragraphs each:
`cancellation.md`, `pets.md`, `payment.md`, `accessibility.md`,
`check-in.md`. Each states at least one concrete, checkable fact the model
could not guess (a specific fee, a cutoff hour, a weight limit) so a right
answer is distinguishable from a plausible one.

`hotelbot/config.py` — adds `POLICIES_DIR`, `CHROMA_DIR`, `CHUNK_SIZE = 500`,
`CHUNK_OVERLAP = 50`, `POLICY_COLLECTION = "policies"`.

`hotelbot/index.py`

```python
def get_policy_index() -> Chroma        # opens CHROMA_DIR; builds if missing or stale
def rebuild_policy_index() -> Chroma    # drops and rebuilds — book 7 needs it
```

"Stale" is decided by comparing the set of policy file names stored in the
collection's metadata with the files on disk; a new or removed file triggers
a rebuild, an edited one does not (call `rebuild_policy_index()` for that).

`hotelbot/tools.py` — adds:

```python
lookup_policy(question) -> str   # top-3 chunks, each prefixed "[source: pets.md]", joined by blank lines
```

`hotelbot/agent.py` — `build_agent` adds `lookup_policy` to the tool list.

## Notebook outline

| # | kind | idea |
| --- | --- | --- |
| 0 | md | title — the agent can search hotels but knows nothing about the rules; this book gives it the rulebook without stuffing it into every prompt |
| 1 | code | `configure_tracing(4)`, check `OPENAI_API_KEY` is present, `build_agent()` from book 3 |
| 2 | md/code | **The model guesses policy.** "Can I bring my dog to Casa do Castelo?" Predict: refuse, hedge, or invent? Compare its answer to `data/policies/pets.md` by eye — the specific fee or weight limit is wrong or missing. |
| 3 | md/code | **Documents become chunks.** Load the five files; `RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)`; print the count and two adjacent chunks so the overlap is visible. Why not one chunk per file: a 6-paragraph file returned whole for a one-line question is mostly noise. |
| 4 | md/code | **An embedding is a list of numbers.** `OpenAIEmbeddings().embed_query("dog")` — 1536 floats; the first five. Embed "pet", "cancellation"; compute the dot product of each pair by hand with a `for` loop, then normalise — "dog·pet" is close to 1, "dog·cancellation" much lower. That's the whole trick: near in meaning, near in numbers. |
| 5 | md/code | **The index.** `Chroma(collection_name, embedding_function, persist_directory=CHROMA_DIR)`, `add_documents(chunks)`; `similarity_search("bringing a dog", k=3)` — print the three sources and the first line of each. Predict which file wins before running. |
| 6 | md/code | **Persistence.** Time the build in cell 5; now `get_policy_index()` again and time it — milliseconds, no embedding calls in the trace. `ls data/chroma/`. The cost is paid once and the result is a file like the rest of `data/`. |
| 7 | md/code | **The tool.** `lookup_policy.invoke({"question": "can I bring a dog"})` — a string with three `[source: …]` blocks. That string is what the model will read; nothing else about the index reaches it. |
| 8 | md/code | **The agent decides.** `build_agent()` now carries `lookup_policy`. The dog question: the trace shows the tool call and the answer now quotes the real fee. "Is there a gym at Casa do Castelo?": no `lookup_policy` call — predict first. Then a question on the boundary ("do I pay now or at the hotel?") — watch whether it looks it up or guesses; either outcome is the lesson. |
| 9 | md | closing — the agent can consult documents and chooses when to. What it reads comes back as a `ToolMessage` like any other tool result — book 7 shows why that channel needs watching. Book 5 gives it memory and lets it book. |

## Done when

- Cell 2's answer contradicts or omits a fact in `pets.md`; cell 8's matches it.
- Cell 4's normalised dot products order as "dog·pet" > "dog·cancellation".
- Cell 6's second open makes no embedding calls (check the trace) and
  `data/chroma/` exists on disk afterwards.
- Cell 8's gym question makes no `lookup_policy` call.
- `get_policy_index()` on a fresh clone builds the index without any manual step.

## Not in this book

Retrieval quality — chunk-size sweeps, hybrid search, reranking, metrics —
is the read-next project's subject and not repeated. Retrieving on every
turn (ADR-0005 rules it out). The poisoned document (book 7). Citations in
the final answer beyond what the model chooses to repeat.
