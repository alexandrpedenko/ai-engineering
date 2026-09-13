# read-next — spec

A paper recommender built on a full RAG stack. You ask what you want to learn
today, it returns a ranked list of arXiv papers with a grounded reason for each,
and it **learns from what you click** — every 👍, 👎 or "reading it" moves a
taste vector, and the next question you ask is ranked with it.

```python
session = Session(user="olek")
session.ask("papers on fine-tuning")     # 5 cards, each with buttons
session.feedback("2305.14314", "like")   # recorded; the next ask() is ranked with it
```

This file is the architecture: what is true across every book. The per-book
plans live in `specs/`, and the decisions they rest on live in `adr/`. When a
book spec and this file disagree, **this file is right and the book spec is
stale**; anything a book discovers that changes a contract gets promoted up here
in the same commit.

## The books

| | book | status | spec |
| --- | --- | --- | --- |
| 1 | the corpus — fetch, freeze a record shape, decide what a chunk is | built | [specs/1-corpus.md](specs/1-corpus.md) |
| 2 | embeddings — batching, an on-disk cache, cosine by hand, negation | built | [specs/2-embeddings.md](specs/2-embeddings.md) |
| 3 | the vector store — brute force behind a protocol, `search()` | built | [specs/3-vector-store.md](specs/3-vector-store.md) |
| 4 | **the app** — cards, buttons, taste vector, seen-set, event log | next | [specs/4-the-app.md](specs/4-the-app.md) |
| 5 | measuring the loop — click metrics, replay, interleaving, Rocchio | | [specs/5-measuring-the-loop.md](specs/5-measuring-the-loop.md) |
| 6 | the LLM front door — structured query, scope guard, free-text refine | | [specs/6-llm-front-door.md](specs/6-llm-front-door.md) |
| 7 | hybrid search — BM25, RRF, weighted fusion | | [specs/7-hybrid-search.md](specs/7-hybrid-search.md) |
| 8 | rerank, diversify, explain — listwise, MMR, grounded `why` | | [specs/8-rerank-diversify-explain.md](specs/8-rerank-diversify-explain.md) |
| 9 | evaluate everything — the whole table, simulated personas | | [specs/9-evaluate-everything.md](specs/9-evaluate-everything.md) |

## The decisions

Accepted, and binding until an ADR supersedes them.

| | decision |
| --- | --- |
| [0001](adr/0001-openai-as-sole-provider.md) | OpenAI as the sole provider |
| [0002](adr/0002-fixed-committed-arxiv-corpus.md) | A small, fixed, committed arXiv corpus |
| [0003](adr/0003-small-to-big-chunking.md) | small-to-big chunking |
| [0004](adr/0004-brute-force-store-behind-a-protocol.md) | Brute-force search behind a `VectorStore` protocol |
| [0005](adr/0005-evaluation-from-the-interaction-log.md) | **Evaluation comes from the interaction log, never from hand labels** |
| [0006](adr/0006-build-order-app-first.md) | **Build order: application, then measurement, then techniques** |
| [0007](adr/0007-retrieval-and-personalisation-are-two-stages.md) | Retrieval and personalisation are two stages |
| [0008](adr/0008-per-user-personalisation-only.md) | Per-user personalisation only, no cross-user logic |
| [0009](adr/0009-llm-returns-typed-objects.md) | The LLM returns typed objects, never prose for its own sake |
| [0010](adr/0010-llm-as-judge-limited-to-faithfulness.md) | LLM-as-judge is limited to faithfulness |
| [0011](adr/0011-one-pipeline-config.md) | One `PipelineConfig`, one code path |
| [0012](adr/0012-simulated-personas-optional-and-segregated.md) | Simulated personas are optional and never mix with real events |
| [0013](adr/0013-feedback-applies-to-the-next-turn.md) | **Feedback applies to the next turn, never to the list on screen** |

## The shape of the application

Two stages, kept separate in the code and in the metrics (ADR-0007):

```
query: "fine tuning"
      │
      ▼
 1. RETRIEVE — relevance        embeddings, BM25, filters
    same for every user         → ~40 candidate papers
      │
      ▼
 2. RE-RANK — preference        blend with this user's taste vector
    different per user          → 5 papers, this user's order
      │
      ▼
 5 cards, each with 👍 📖 👎
```

Stage 1 is a correctness question — is this paper about fine-tuning at all —
improved by books 6–8. Stage 2 is a preference question — did *you* want it —
answered only by clicks. They join at one dial:

```
search_vector = α · query_vector  +  (1 − α) · taste_vector
```

`α = 1` ignores the user; `α = 0` ignores what they typed. Book 5 sweeps it.

## Where the numbers come from

**Your clicks. Nothing is hand-labelled, ever** (ADR-0005). There is no golden
set, no judging pass, no file where a developer writes down which papers are
relevant.

Every search appends one event to `data/events.jsonl`:

```json
{"session": "s07", "turn": 1, "user": "olek",
 "query": "efficient inference on device",
 "resolved_query": {"semantic_text": "...", "published_after": "2024-01-01"},
 "config": {"use_bm25": false, "...": "..."},
 "candidates": ["…40 paper ids — the stage-1 pool…"],
 "shown": ["2401.aaa", "2402.bbb", "2403.ccc", "2404.ddd", "2405.eee"],
 "signals": {"2402.bbb": "like", "2404.ddd": "dislike"}}
```

That log is the test set, and it is produced by using the app. Three label-free
uses:

- **Live metrics** — was anything clicked, and how far down; abandonment.
- **Replay** — re-rank a logged event's stored `candidates` with a different
  `PipelineConfig`, and see where the clicked papers land. No human present,
  repeatable forever.
- **Interleaving** — two rankers alternate slots in one list; clicks go to
  whichever ranker owned the slot. Immune to position bias.

Every book from 5 onward adds one row to a table built this way, or explains why
the row didn't move.

```
$ pipenv run python -m readnext.eval --replay --config all
config                    hit@20   MRR@10   nDCG@10   $/query   ms/query
dense-only                  0.61     0.42      0.38    0.0000         90
+ structured query          0.63     0.51      0.46    0.0006        480
+ bm25 (rrf)                0.74     0.58      0.53    0.0006        510
+ llm rerank                0.74     0.71      0.68    0.0043       1900
+ mmr diversity             0.74     0.69      0.70    0.0043       1950
```

Read as: *of the papers I clicked, what fraction does this config put in the top
20, and how high.* The denominator is clicks, not somebody's opinion.

**What the log cannot see:** a paper never shown can never be clicked, so it
scores ordering honestly and cannot report "there was a better paper you never
saw". This repairs itself — book 7's BM25 surfaces papers dense search never
did, and using the app afterwards widens the log's coverage. Coverage grows with
the system, unlike an answer key frozen on the day it was written.

## Where the LLM appears

Each job measured separately, so you learn what it is *worth* in points and in
dollars (ADR-0009).

| Job | Book | What it returns |
| --- | --- | --- |
| Query understanding | 6 | `StructuredQuery` — semantic text, filters, `in_scope` |
| Clarifying question | 6 | one question that fills one schema field, or `None` |
| Feedback parsing | 6 | `ParsedFeedback` — refinement, ids to boost/drop |
| Listwise rerank | 8 | an ordering over ~40 candidates |
| Grounded explanation | 8 | `why` + the chunk ids it used |
| Faithfulness judge (eval only) | 8 | does `why` follow from the cited text? |
| Simulated user (eval only, optional) | 9 | a persona's clicks, at volume |

Nothing on that list decides whether a paper is relevant to you. That is only
ever answered by a click.

## Provider

| Job | Model |
| --- | --- |
| Embeddings | `text-embedding-3-small` (1536-dim; 512 ablated in book 3) |
| Query understanding, feedback parsing, rerank, explanation | `gpt-5-mini` |
| Faithfulness judge, simulated user (eval only) | `gpt-5` |

Ids are pinned in `readnext/config.py` (ADR-0001) — confirm them before book 6.
Needs `OPENAI_API_KEY` in the repo-root `.env`; the older
`openai/open-ai-requests.py` uses `OPEN_AI_API` and this project does not follow
it.

Dependencies: `openai`, `numpy`, `rank-bm25`, `pydantic`, `tiktoken`.
`ipywidgets` is already in the Pipfile — it's what makes book 4's cards
clickable.

## The corpus

arXiv's public API — no key, one script (ADR-0002). 1,693 papers, `cs.CL` /
`cs.LG` / `cs.AI` / `cs.IR`, 2023 onward, committed as `data/papers.jsonl`.
Abstracts only; they are 150–300 words, which is what makes small-to-big
concrete without a PDF pipeline.

Record contract, frozen in book 1 — everything downstream depends on it:

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

## Layout

A notebook contains only its own subject; anything an earlier book taught is
promoted into the package and imported from there.

```
openai/read-next-project/
  spec.md                  this file — architecture
  specs/                   one plan per book
  adr/                     decisions, numbered, superseding not deleting
  index.md                 written at the end
  1-corpus.ipynb  …  9-evaluate-everything.ipynb
  data/
    papers.jsonl           the corpus (committed)
    events.jsonl           every search and click (committed — it's the test set)
    sim_events.jsonl       simulated personas, book 9 (committed, never merged)
    personas.json          (committed)
    profiles/              per-user taste state (gitignored, rebuildable)
    index/                 embedding cache + cost log (gitignored, rebuildable)
  readnext/
    config.py       model ids, paths, PipelineConfig            built
    corpus.py       load/clean/chunk papers                     built
    embed.py        batched embeddings, cache, cost log         built
    store.py        VectorStore protocol; NumpyStore            built
    search.py       dense now; fusion and filters later         built (dense)
    events.py       the interaction log                         book 4
    profile.py      taste vectors, negatives, cold start        book 4
    recommend.py    the pure ranking function                   book 4
    session.py      state across turns, the interaction loop    book 4
    ui.py           ipywidgets cards, buttons, fixed slots      book 4
    metrics.py      click metrics, MRR, nDCG, diversity         book 5
    eval.py         replay + interleaving, ablation CLI         book 5
    feedback.py     Rocchio, sweeps, exploration slot           book 5
    query.py        structured query, scope guard, refine       book 6
    lexical.py      BM25 index                                  book 7
    rerank.py       LLM listwise reranker                       book 8
    explain.py      grounded explanation + faithfulness judge   book 8
    personas.py     simulated users                             book 9
```

## Core contracts

Pinned in book 4, because that is where the product exists. Books 5–9 swap
components behind them without changing these shapes.

```python
Signal = Literal["like", "dislike", "reading"]

@dataclass
class Recommendation:
    paper: Paper
    score: float
    why: str = ""                                        # book 8 fills these
    citations: list[str] = field(default_factory=list)

@dataclass
class Profile:
    user: str
    liked: list[str] = field(default_factory=list)
    disliked: list[str] = field(default_factory=list)
    reading: list[str] = field(default_factory=list)

    def taste_vector(self, ...) -> np.ndarray | None     # None at cold start

@dataclass
class Event:                   # one row of data/events.jsonl
    session: str; turn: int; user: str
    query: str
    resolved_query: dict       # the StructuredQuery, book 6 on
    config: dict               # which PipelineConfig produced it
    candidates: list[str]      # the whole stage-1 pool — what replay re-ranks
    shown: list[str]           # the 5 that reached the screen
    signals: dict[str, Signal]
    ts: str

@dataclass
class PipelineConfig:          # one row of the table (ADR-0011)
    use_structured_query: bool = False
    use_bm25: bool = False
    use_rerank: bool = False
    use_mmr: bool = False
    fusion: Literal["rrf", "weighted"] = "rrf"
    alpha: float = 0.7          # query vs taste blend
    gamma: float = 0.5          # how hard a dislike pushes the taste vector
    candidate_chunks: int = 200
    candidates_k: int = 40
    final_k: int = 5

@dataclass
class Session:                 # the only stateful object
    profile: Profile
    config: PipelineConfig
    turn: int = 0
    seen: set[str] = field(default_factory=set)
    signals: dict[str, Signal] = field(default_factory=dict)

    def ask(self, text: str) -> list[Recommendation]
    def feedback(self, paper_id: str, signal: Signal) -> None
    def refine(self, text: str) -> None                  # book 6
```

The ranking itself stays pure —

```python
retrieve(index, query_vector, config, exclude=frozenset()) -> list[str]           # stage 1: paper ids
rerank(index, candidates, query_vector, profile, config) -> list[Recommendation]  # stage 2
recommend(index, query_vector, profile, config, exclude=frozenset()) -> list[Recommendation]
```

— no session, no disk, no state, so book 5 can replay it thousands of times.
`Index` (`search.py`) bundles the `VectorStore` with the per-paper records and
vectors the two stages need; the store alone only knows chunks.

## Ground rules

- **Nothing is hand-labelled.** If a book ever asks you to mark which papers are
  relevant, the design has gone wrong. The click is the label.
- **Committed data is the corpus, the event log and the personas.** The index
  and the profiles are derived and gitignored — the profiles rebuildable by
  replaying events.
- **Every API call goes through `embed.py` or a client wrapper that logs tokens
  and cost.** You should be able to answer "what did this book cost" at any
  point.
- **No technique lands without a table row.** If a row doesn't move, keep the
  notebook and write down why — that's the most useful cell in it.
- **A decision that outlives its book goes in `adr/`,** superseding rather than
  editing the one it replaces.
- **Don't run the notebooks from an agent** (project rule) — edit cells, run
  them yourself.

## Out of scope, on purpose

Cross-user collaborative filtering (ADR-0008), agentic/self-correcting
retrieval, query decomposition, a web serving API or front end (the notebook
widgets are the UI), full-text PDF parsing, fine-tuned rerankers, and a hosted
vector DB. Agentic retrieval overlaps what `claude/shop-assistant-project`
already covers; the rest are engineering, not new ideas.
