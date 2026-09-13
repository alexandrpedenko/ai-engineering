# Book 4 — the app

**Status:** not built — next
**Implements:** ADR-0006 (app first), ADR-0007 (two stages), ADR-0008 (per-user),
ADR-0011 (one config). **Produces the data** ADR-0005 depends on.

## What you can do after this that you couldn't before

Use the thing. Type a query, get five papers as clickable cards, press 👍 / 📖 /
👎, and see the *next* question ranked differently because of it — without
re-running a cell (ADR-0013).
And every one of those searches is on disk in a shape book 5 can score.

Book 3 could rank papers. It could not be *used*, and it could not learn.

## Builds on

Book 1's `Paper`/`Chunk`, book 2's `embed_texts` and cache, book 3's
`NumpyStore` and `search()`. Nothing new is retrieved — this book is about what
surrounds retrieval.

## Explicitly no LLM in this book

No query parsing, no reranking, no explanations. The raw query string goes to
the embedder exactly as book 3 sent it. Book 6 adds the LLM front door, and it
has to prove it was worth it against the numbers this book's log produces.

## Module contracts

### `readnext/profile.py`

```python
Signal = Literal["like", "dislike", "reading"]

@dataclass
class Profile:
    user: str
    liked: list[str] = field(default_factory=list)      # paper ids
    disliked: list[str] = field(default_factory=list)
    reading: list[str] = field(default_factory=list)

    def record(self, paper_id: str, signal: Signal) -> None
    def taste_vector(self, paper_vectors: dict[str, np.ndarray],
                     gamma: float = 0.5) -> np.ndarray | None
    # None when nothing positive has been recorded — cold start.

    def save(self, dir=PROFILES_DIR) -> None
    @classmethod
    def load(cls, user: str, dir=PROFILES_DIR) -> Profile
```

`reading` counts as a positive, weighted the same as `liked` for now. Whether it
should weigh more is an open question below.

### `readnext/recommend.py`

```python
@dataclass
class Recommendation:
    paper: Paper
    score: float
    why: str = ""                                        # book 8 fills this
    citations: list[str] = field(default_factory=list)   # book 8 fills this

retrieve(index, query_vector, config, exclude=frozenset()) -> list[str]
rerank(index, candidates, query_vector, profile, config) -> list[Recommendation]
recommend(index, query_vector, profile, config, exclude=frozenset()) -> list[Recommendation]
```

`index` is `search.Index`: the store plus per-paper records and vectors. Pure: no disk, no session, no globals, so book 5 can call it thousands of times
in a replay loop. `exclude` is the seen-set, passed in rather than remembered.

### `readnext/events.py`

```python
@dataclass
class Event:
    session: str
    turn: int
    user: str
    query: str
    resolved_query: dict          # {} until book 6
    config: dict                  # asdict(PipelineConfig) that produced it
    candidates: list[str]         # the full stage-1 pool (~40 paper ids)
    shown: list[str]              # the 5 that reached the screen, in order
    signals: dict[str, Signal]    # filled in as clicks arrive
    ts: str

append(event) -> None
load(path=EVENTS_FILE) -> list[Event]
update_signals(session, turn, paper_id, signal) -> None
```

Append-only JSONL. A click on turn 1 after turn 2 has been asked still lands on
turn 1's row.

### `readnext/session.py`

```python
@dataclass
class Session:
    profile: Profile
    config: PipelineConfig = field(default_factory=PipelineConfig)
    turn: int = 0
    seen: set[str] = field(default_factory=set)
    signals: dict[str, Signal] = field(default_factory=dict)

    def ask(self, text: str) -> list[Recommendation]   # search, log, render
    def feedback(self, paper_id: str, signal: Signal) -> None  # update, log, mark the card
```

### `readnext/ui.py`

```python
Deck(n, on_feedback)          # n card slots with three buttons each, built once
Deck.show(recs, header)       # refill the slots for a new turn
Deck.mark(i, signal)          # light the pressed button; the card stays put
```

The slots are created before anything is displayed and only refilled after —
notebook front ends are unreliable at drawing widgets created later. The
`Deck` lives in the `Session`, so a new turn updates the same output area
rather than printing a new one. A click marks its card and nothing else moves
(ADR-0013).

### `readnext/config.py` — additions

`PipelineConfig` (full definition in ADR-0011), `PROFILES_DIR`, `EVENTS_FILE`.
`GOLDEN_FILE` is removed.

## Notebook outline

One idea per cell. `md` cells lead with a bold phrase, no subheadings.

| # | kind | idea |
| --- | --- | --- |
| 0 | md | title — book 3 could rank; this book makes it usable and makes it learn |
| 1 | md | **Five papers on a screen.** Book 3 printed titles. A card is a title, an abstract, a link — and somewhere to click |
| 2 | code | build the store (cached, free), render five static cards |
| 3 | md | **A button is a callback.** The smallest `ipywidgets` example there is, so the widget stops being magic |
| 4 | code | one `Button`, one handler appending to a list, printed live |
| 5 | md | **Three things a click can mean.** 👍 like, 📖 reading, 👎 dislike — and why "reading" is not a stronger "like" |
| 6 | code | `Profile`, made by hand, three signals recorded |
| 7 | md | **A taste vector is an average.** Take the embeddings of the papers you liked and average them — shown as numbers on two papers before it is used on many |
| 8 | code | `taste_vector` for a 2-paper profile; print its 5 nearest papers |
| 9 | md | **Dislikes subtract.** Same average, minus a weighted average of what you rejected. Predict which of the 5 above drops out |
| 10 | code | add one dislike, print the 5 nearest again |
| 11 | md | **But it can't ignore what you typed.** Blend query and taste with α. Guess what α=1 and α=0 each give before running |
| 12 | code | α sweep over `[1.0, 0.7, 0.3, 0.0]`, top-3 titles per value |
| 13 | md | **Cold start.** Turn 1 has no taste vector at all. The code has to work anyway, and the right behaviour is "be plain search" |
| 14 | code | `recommend()` with an empty profile equals book 3's `search()` — asserted |
| 15 | md | **The ranking function stays pure.** No session, no disk — that is what lets book 5 replay it thousands of times |
| 16 | code | `PipelineConfig()`; `recommend(...)` returns `Recommendation` objects |
| 17 | md | **Never show the same paper twice.** The seen-set, and why it belongs to the session and not the ranker |
| 18 | code | second call with `exclude=` — the first five are gone |
| 19 | md | **The session holds what the ranker won't.** Profile, seen-set, turn counter, and the widget handle |
| 20 | code | `session = Session(profile=Profile(user="olek"))`; `session.ask("papers on fine-tuning")` |
| 21 | md | **Now click.** The handler calls `session.feedback(...)`, which records the signal and marks the card; the list stays put, the next `ask()` is where it shows |
| 22 | code | the live widget — rate a few, ask a paraphrase, compare |
| 23 | md | **Everything you just did is on disk.** The `Event` shape, field by field |
| 24 | code | `events.load()[-1]` — read back the row you just made |
| 25 | md | **Why the whole candidate pool, not just the five.** Book 5 re-ranks this pool with tomorrow's code and asks where your clicks landed. A row without `candidates` is unreplayable forever |
| 26 | md | **Now go and use it.** Five or six real sessions, varied queries — paraphrases, bare acronyms, topics with a restriction. Nothing to mark, nothing to judge |
| 27 | code | a bare `Session(...)` cell to re-run with your own queries |
| 28 | md | closing — you have an app and an opinion about it; book 5 turns the opinion into a number |

## Data written

- `data/events.jsonl` — committed. The test set (ADR-0005).
- `data/profiles/<user>.json` — gitignored, rebuildable by replaying events.

## Done when

- Five or six real sessions have been run and `data/events.jsonl` has rows with
  non-empty `candidates`, `shown` and `signals`.
- A click is acknowledged on its card; the *next* question is visibly ranked
  differently because of it, with no cell re-run.
- Nothing repeats within a session.
- An empty profile behaves exactly like book 3's `search()`.
- You can say in one sentence why the recommendations feel good or bad. That
  sentence is book 5's starting point.

## Not in this book

| | goes to |
| --- | --- |
| Any metric or score | book 5 |
| Rocchio by name, α/β/γ sweep, the bubble, exploration slot | book 5 |
| Free-text refinement, query parsing, scope guard | book 6 |
| BM25 | book 7 |
| Rerank, MMR, explanations | book 8 |

The taste vector here is deliberately naive — mean minus weighted mean, α fixed
at the config default. Naming it Rocchio and tuning it needs a number, and there
isn't one until book 5.

## Open questions to settle while building

1. **Does 📖 "reading it" weigh more than 👍?** Starting position: same weight.
   Revisit in book 5 once it can be swept.
2. **Does a dislike apply to the paper or to the topic?** Starting position: the
   paper only, via the γ term.
3. **Should the taste vector persist across sessions by default?** Starting
   position: yes, `Profile` loads from disk — that is the "recommendation based
   on his previous search" behaviour from the original idea. Book 5 can measure
   whether it helps.
4. **Paper-level vectors:** average a paper's chunk vectors (book 2's approach),
   or use its best-matching chunk? Starting position: average, cached once.
