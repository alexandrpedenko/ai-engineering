# read-next — spec

A paper recommender built on a full RAG stack. It asks what you want to learn
today, returns a ranked list of arXiv papers with a grounded reason for each,
and then **learns from what you click** — every 👍, 👎 or "reading it" moves the
taste vector and re-ranks the list in place.

Two things make it not a chat bot. The LLM's job in the loop is *parsing
preference*, not conversing; and the deliverable is one function and one number:

```python
recommend(profile, query, k=10) -> list[Recommendation]
```

```
$ pipenv run python -m readnext.eval --config all
config                      recall@20   MRR@10   nDCG@10   $/query   ms/query
dense-only                       0.61     0.42      0.38     0.0001         90
+ bm25 (rrf)                     0.74     0.51      0.47     0.0001        110
+ metadata filters               0.74     0.58      0.53     0.0009        400
+ llm rerank                     0.74     0.71      0.68     0.0043       1900
+ mmr diversity                  0.74     0.69      0.70     0.0043       1950
+ feedback, turn 3               0.74     0.83      0.79     0.0043       1950
```

Every notebook adds one row to that table, or explains why the row didn't move.
That is the whole point of the project: **each RAG technique gets measured, not
assumed.**

## Why this shape

Three things fall out of it that a chat interface hides:

- **Retrieval quality is separable from generation quality.** With a fixed
  golden set you can see a change to chunking move recall@20 without ever
  calling a generation model.
- **The LLM appears in exactly three places** — query understanding, reranking,
  explanation — so you learn what each one is *worth*, in points and in dollars.
- **Failures are legible.** A bad recommendation is a specific paper that
  should have been retrieved and wasn't, or was retrieved and ranked 40th.
- **Interaction is a measurable feature.** Because there's a golden set, "did
  clicking 👍 make the next turn better?" has a number attached, not a feeling.

## Provider

OpenAI, throughout.

| Job | Model | Why |
| --- | --- | --- |
| Embeddings | `text-embedding-3-small` | cheap, 1536-dim, good enough; dimension trade-off is an ablation in notebook 3 |
| Query understanding | `gpt-5-mini` | structured output, called once per query |
| Reranking | `gpt-5-mini` | listwise over ~40 candidates; the expensive step |
| Feedback parsing | `gpt-5-mini` | free-text preference → typed `ParsedFeedback` |
| Explanation | `gpt-5-mini` | structured output with citations |
| LLM judge (eval only) | `gpt-5` | grading faithfulness needs the stronger model |
| Simulated user (eval only) | `gpt-5` | plays a persona clicking 👍/👎, to test the loop |

Confirm the exact model ids are still current before notebook 3 — pin them in
`readnext/config.py` so a rename is a one-line change.

Needs `OPENAI_API_KEY` in the repo-root `.env`. Note the existing
`openai/open-ai-requests.py` uses `OPEN_AI_API`; this project standardises on
`OPENAI_API_KEY` (the name the SDK reads by default).

New dependencies: `openai`, `numpy`, `rank-bm25`, `pydantic`, `tiktoken`,
`sqlite-vec` (from notebook 4). `ipywidgets` is already in the Pipfile — it's
what makes the notebook 8 UI clickable.

## The corpus

arXiv's public API — no key, no Kaggle download, one script.

- Categories: `cs.CL`, `cs.LG`, `cs.AI`, `cs.IR`
- ~2,000 papers, 2023 onward
- Stored as `data/papers.jsonl`, committed, so the corpus is fixed and results
  are comparable across runs

Record contract — frozen in notebook 1, everything downstream depends on it:

```json
{
  "id": "2401.01234v1",
  "title": "...",
  "abstract": "...",
  "authors": ["..."],
  "categories": ["cs.CL", "cs.LG"],
  "primary_category": "cs.CL",
  "published": "2024-01-02",
  "updated": "2024-01-15",
  "url": "https://arxiv.org/abs/2401.01234"
}
```

Abstracts are short (150–300 words), which is a feature: it makes the
**small-to-big** distinction concrete (retrieve on a sentence window, present
the whole abstract) without needing a PDF pipeline.

## Layout

Mirrors `claude/shop-assistant-project/`: a notebook contains only its own
subject, and anything an earlier notebook already taught is promoted into the
package and imported from there.

```
openai/read-next-project/
  spec.md                  this file
  index.md                 written at the end — the per-notebook breakdown
  1-corpus.ipynb  …  9-eval-and-ablation.ipynb
  data/
    papers.jsonl           the corpus (committed)
    golden.jsonl           eval set: query + relevant ids (committed)
    profiles.json          3 seed profiles (committed)
    personas.json          simulated users for evaluating the loop (committed)
    sessions/              saved session state (gitignored)
    index/                 embeddings + sqlite db (gitignored, rebuildable)
  readnext/
    __init__.py
    config.py              model ids, paths, k values, weights
    corpus.py             load/clean/chunk papers
    embed.py              batched embeddings + on-disk cache + cost log
    store.py              VectorStore protocol; NumpyStore, SqliteStore
    lexical.py            BM25 index
    search.py             dense / lexical / hybrid, RRF, filters, MMR
    query.py              structured query understanding
    rerank.py             LLM listwise reranker
    explain.py            grounded explanation with citations
    profile.py            taste vectors, negatives, cold start
    feedback.py           Rocchio update, seen-set, free-text feedback parsing
    session.py            Session: state across turns, the interaction loop
    ui.py                 ipywidgets rendering — cards, buttons, re-render
    recommend.py          the one public function; assembles a pipeline config
    metrics.py            recall@k, MRR, nDCG
    eval.py               harness + ablation table CLI
```

## Core contracts

Pin these early; they are what let notebooks 5–9 swap components freely.

```python
class VectorStore(Protocol):
    def add(self, ids: list[str], vectors: np.ndarray, meta: list[dict]) -> None: ...
    def search(self, vector: np.ndarray, k: int,
               where: Filter | None = None) -> list[Hit]: ...

@dataclass
class Hit:
    chunk_id: str
    paper_id: str
    score: float
    source: Literal["dense", "bm25", "hybrid"]

@dataclass
class PipelineConfig:          # one row of the ablation table
    use_bm25: bool = False
    use_filters: bool = False
    use_rerank: bool = False
    use_mmr: bool = False
    fusion: Literal["rrf", "weighted"] = "rrf"
    candidates_k: int = 40
    final_k: int = 10

@dataclass
class Recommendation:
    paper: Paper
    score: float
    why: str                   # 1–2 sentences, grounded
    citations: list[str]       # chunk_ids actually used

Signal = Literal["like", "dislike", "reading"]

@dataclass
class Session:
    profile: Profile
    query: str
    config: PipelineConfig
    turn: int = 0
    seen: set[str] = field(default_factory=set)      # never show twice
    signals: dict[str, Signal] = field(default_factory=dict)

    def next_turn(self) -> list[Recommendation]: ...
    def feedback(self, paper_id: str, signal: Signal) -> None: ...
    def refine(self, text: str) -> None:             # free-text → parsed → applied
        ...

class ParsedFeedback(BaseModel):                     # what gpt-5-mini returns
    refine_query: str | None = None
    boost_ids: list[str] = []
    drop_ids: list[str] = []
    exclude_terms: list[str] = []
```

`Session` is the only stateful object in the project. `recommend()` stays pure —
it takes a vector and a config and returns a list — so everything through
notebook 7 remains testable without a session.

`recommend()` takes a `PipelineConfig`. Every ablation is that dataclass with
one field flipped — no branching code paths to keep in sync.

## The notebooks

Nine, each assuming the previous. Difficulty climbs; nothing after notebook 3
requires a concept that hasn't been introduced.

### 1-corpus.ipynb — get the data, decide what a chunk is

Fetch from arXiv, normalise into the record contract above, write
`papers.jsonl`. Then the first real decision: **what unit gets embedded?**

Compare three, by eye first:
- whole abstract as one chunk
- fixed 2-sentence windows with 1-sentence overlap
- **small-to-big** — embed the window, return the whole paper

Also: `tiktoken` token counts, so "2,000 papers" becomes a number of tokens and
a dollar figure before you spend it.

**Done when:** `readnext.corpus.load()` and `chunk(strategy=...)` exist, and
you can state in one sentence why you picked the strategy you picked.

### 2-embeddings.ipynb — text becomes vectors

Batched calls to `text-embedding-3-small` (100 texts/request), a **content-hashed
on-disk cache** so re-running a notebook is free, and a cost log that
accumulates tokens and dollars per run.

Then the thing that makes vectors stop being magic: compute cosine similarity by
hand with numpy, find the nearest neighbours of one paper, and read them. Also
check the failure mode — embed "not about transformers" and see that negation
does approximately nothing.

**Done when:** the corpus is embedded, the cache turns a re-run into ~0 API
calls, and you can print the 5 nearest papers to any paper.

### 3-vector-store.ipynb — a searchable index

Brute-force first: `NumpyStore`, one matrix, `argsort` over a dot product. It's
~2,000 vectors — this is genuinely fast, and it makes the point that you don't
need a vector database to start.

Then the ablation: **dimension reduction** (`dimensions=512` on the embeddings
endpoint) — how much recall do you lose, how much speed/space do you gain?

**Done when:** `search("query text", k=10)` returns sensible papers, and
`VectorStore` is a protocol with one implementation behind it.

### 4-golden-set-and-metrics.ipynb — the number

The pivot point of the project. Before adding any technique, build the thing
that says whether a technique helped.

- ~25 queries in `golden.jsonl`, written by hand, each with 3–10 relevant
  paper ids. Bootstrap candidates with the dense index, then **judge them
  yourself** — a golden set you didn't inspect measures nothing.
- Implement `recall@k`, `MRR@10`, `nDCG@10` from scratch. They're ten lines each
  and knowing exactly what they penalise matters more than the code.
- Record the **dense-only baseline**. Every later notebook is measured against
  this row.

**Done when:** `python -m readnext.eval --config dense-only` prints a table row,
and you can explain what a recall@20 of 0.61 means for a user.

### 5-hybrid-search.ipynb — dense isn't enough

Build a BM25 index and immediately find queries where it beats embeddings
(exact model names, rare acronyms, author surnames) and queries where it loses
badly (paraphrase, concept-level).

Then fuse: **Reciprocal Rank Fusion** first (no score normalisation needed,
which is the point), then weighted score fusion for contrast. Sweep the RRF `k`
constant and the dense/lexical weight against the golden set.

**Done when:** two new rows in the ablation table, and a short written note on
which query types each retriever owns.

### 6-query-understanding.ipynb — the LLM's first job

"recent work on retrieval evaluation, nothing older than 2024, prefer cs.IR" is
a filter and a semantic query wearing one coat. Use structured output to split
them:

```python
class StructuredQuery(BaseModel):
    semantic_text: str
    categories: list[str] = []
    published_after: date | None = None
    exclude_terms: list[str] = []
```

Then metadata filtering, and the trap that matters: **pre-filter vs post-filter.**
Post-filtering silently returns fewer than `k` and biases results toward
whatever survived; pre-filtering needs the store to support it. Implement
pre-filter in both stores.

Ablations, if you want them: multi-query expansion and HyDE. Measure both —
one of them probably won't earn its latency on this corpus, and finding that
out is the lesson.

**Done when:** filters are applied *before* the search, and the table shows what
query understanding bought.

### 7-rerank-diversify-explain.ipynb — the top of the funnel

Three things that only touch the final ~40 candidates.

- **Listwise LLM rerank.** Send 40 candidates as a compact list, get back an
  ordering with scores. This is where MRR and nDCG jump and where the cost
  jumps too — log both. Compare against a pointwise reranker to see why
  listwise is usually the better trade.
- **MMR diversity.** The classic recommender failure is ten near-identical
  papers. Tune λ and watch nDCG trade against a diversity metric you define.
- **Grounded explanation.** Structured output producing `why` + `citations`,
  where citations must be chunk ids that were actually in the prompt. Validate
  that they are — a citation the model invented is a bug, not a style issue.

**Done when:** `recommend()` returns full `Recommendation` objects and no
explanation cites a chunk that wasn't retrieved.

### 8-feedback-loop.ipynb — the app becomes interactive

Where the hardcoded profile goes away.

**The taste vector, first.** Mean of the embeddings of papers you've read, minus
a weighted mean of ones you disliked. Blend with the query vector
(`α * query + (1-α) * taste`) and sweep α. Check **cold start** too — no
history, only free-text interests: does the profile help or hurt?

**Then make it learn.** Feedback isn't "append to a list", it's a named IR
algorithm — **Rocchio relevance feedback**:

```
q' = α·q  +  β·mean(liked)  −  γ·mean(disliked)
```

Sweep α/β/γ against the golden set, and watch for the failure that only a loop
reveals: crank β and results **collapse into a bubble** by turn three — every
paper is the same paper. Two fixes, both worth implementing:

- a **seen-set**, so nothing is recommended twice in a session
- an **exploration slot** — reserve 1 of 5 for a high-MMR outsider, so the loop
  can still surprise you

**Two feedback channels, one destination.**

- **Buttons** (`ipywidgets`, already a dependency): each recommendation renders
  as a card with `👍 more like this` / `📖 reading it` / `👎 not this`. A click
  calls `session.feedback(paper_id, signal)`, which updates the vector and
  re-renders the list **in place** — no re-running the cell.
- **Free text**: "less benchmark papers, more about the judge models
  themselves". `gpt-5-mini` parses it into `ParsedFeedback` — a query
  refinement, ids to boost or drop, terms to exclude — which feeds the *same*
  Rocchio update plus a filter change.

The second channel is the only chat-shaped part of the app, and it's worth
noticing why it's still not a chat bot: the model returns a **typed object that
changes a vector**, never prose for a human to read.

**The session shape**, top to bottom in the notebook:

```
"What do you want to learn about today?"   → seed query, turn 1
  → 5 cards, each with buttons
  → clicks update the taste vector, list re-renders
  → "Anything to adjust?"                   → parsed → turn 2
  → repeat
session.save()  → data/sessions/, so a profile can carry across notebook runs
```

**Done when:** three turns of clicking visibly change what comes back, nothing
repeats, and the bubble is something you've seen happen and then fixed.

### 9-eval-and-ablation.ipynb — does any of it actually work

Run the complete ablation over all configs × all profiles and print the table.
Two columns that need their own machinery:

- **Faithfulness (LLM judge, `gpt-5`)**: does `why` actually follow from the
  cited text? A different question from whether the ranking was good.
- **Does feedback help?** Evaluate the *loop*, not just the retriever. Give
  `gpt-5` a persona from `personas.json` with a hidden target interest, let it
  click 👍/👎 on three turns of recommendations, and measure **nDCG@10 at turn 1
  vs. turn 3**. If relevance feedback works, the number climbs; if your β is too
  high, it climbs then collapses as the bubble closes. Add a **diversity**
  column beside it so you can see the trade happen.

Simulated users are how recommender loops get evaluated for real, and it costs
nothing but tokens.

Close with a written read of the table: which techniques paid for themselves,
which didn't, and what you'd cut under a latency budget.

**Done when:** one command reproduces every number in this spec's example
table, and `index.md` is written.

## Ground rules

- **Committed data is the corpus, the golden set and the profiles.** The index
  is derived and gitignored — `python -m readnext.index --rebuild` recreates it.
- **Every API call goes through `embed.py` or a client wrapper that logs
  tokens and cost.** You should be able to answer "what did this notebook cost"
  at any point.
- **No technique lands without a table row.** If a row doesn't move, keep the
  notebook and write down why it didn't — that's the most useful cell in it.
- **Don't run the notebooks from an agent** (project rule) — edit cells, run
  them yourself.

## Out of scope, on purpose

Agentic/self-correcting retrieval, query decomposition, a web serving API or
front end (the notebook widgets are the UI), full-text PDF parsing, fine-tuned
rerankers, a hosted vector DB, and cross-session collaborative filtering. The first
one overlaps with what `shop-assistant-project` already covers; the rest are
engineering, not new ideas. If the project earns a second phase, agentic
retrieval is the natural notebook 9.
