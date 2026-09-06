# Book 5 — measuring the loop

**Status:** not built
**Implements:** ADR-0005 (evaluation from the log), ADR-0011 (config as the row)

## What you can do after this that you couldn't before

Say a number instead of an impression. Take any change to the ranker, replay it
over sessions you already ran, and see whether the papers you clicked moved up —
with no human in the room and no labelling, ever.

And tune the loop book 4 left naive: pick α from a sweep rather than from taste,
and see the bubble form before it bites.

## Builds on

Book 4's `events.jsonl` (needs 5+ real sessions with clicks in them),
`recommend()`, `PipelineConfig`.

## Module contracts

### `readnext/metrics.py`

```python
mean(values) -> float
hit_rate_at_k(ranked_ids, clicked_ids, k) -> float   # fraction of clicks in top k
reciprocal_rank(ranked_ids, clicked_ids, k) -> float
position_weight(rank) -> float                        # 1 / log2(rank + 1)
dcg(gains) -> float
ndcg_at_k(ranked_ids, clicked_ids, k) -> float
abandonment(events) -> float                          # share with no signal at all
intra_list_diversity(paper_ids, vectors) -> float     # 1 - mean pairwise cosine
```

Positive signals are `like` and `reading`. `dislike` is an explicit negative and
scores 0 — not merely unclicked. That distinction is what a click log has and a
label file does not, and it is worth a cell.

### `readnext/eval.py`

```python
@dataclass
class EvalResult:
    name: str; n_events: int
    hit_at_20: float; mrr_at_10: float; ndcg_at_10: float
    diversity: float; usd_per_query: float; ms_per_query: float

replay(events, config, name) -> EvalResult      # re-rank each event's stored pool
replay_by_turn(events, config) -> dict[int, float]   # turn 1 vs turn 3
interleave(rankings_a, rankings_b) -> tuple[list[str], dict[str, str]]
attribute(clicks, owner) -> tuple[int, int]     # credit each click to A or B
format_table(results) -> str

CONFIGS: dict[str, PipelineConfig] = {"dense-only": PipelineConfig(), ...}
# python -m readnext.eval --replay --config all [--by-turn]
```

### `readnext/feedback.py`

```python
rocchio(query_vector, liked, disliked, alpha, beta, gamma) -> np.ndarray
sweep(events, grid) -> list[tuple[params, EvalResult]]
exploration_slot(recs, candidates, vectors, n=1) -> list[Recommendation]
```

`Profile.taste_vector` from book 4 is refactored to call `rocchio` — same
arithmetic, now named and parameterised.

## Notebook outline

| # | kind | idea |
| --- | --- | --- |
| 0 | md | title — book 4 gave you an app and an opinion; this turns the opinion into a number |
| 1 | md | **Your sessions are the test set.** Read one event and name every field: what was asked, what pool came back, what you were shown, what you clicked |
| 2 | code | load events, print one in full |
| 3 | md | **Start with the obvious: count the clicks.** Two clicks is fine alone and useless next to another search |
| 4 | code | tiny hand-checkable example — `results`, `clicked`, count |
| 5 | md | **Counting doesn't compare.** Divide by how many clicks there were to find. That fraction has a name |
| 6 | code | `hit_rate_at_k` on the toy example |
| 7 | md | **It can't see order.** Two lists, same contents, opposite arrangement. Write down both numbers before running |
| 8 | code | list A vs list B — identical scores |
| 9 | md | **Identical, and that's not a bug.** It's a question about contents, and it's the number BM25 should move in book 7 |
| 10 | md | **The simplest way to make order count** — how far down is the first hit? 1/1, 1/2, 1/4, shown as numbers |
| 11 | code | `reciprocal_rank` on A and B |
| 12 | md | **But it stops after the first hit.** A good list and a lucky one score the same |
| 13 | code | list A vs "one lucky" — both 1.0 |
| 14 | md | **So weight every position.** `1 / log2(rank + 1)`: `log2(8)` is 3 because 1 doubled three times is 8. The point is how slowly it grows |
| 15 | code | `position_weight` printed for ranks 1–20 beside `1/rank` |
| 16 | md | **Why the gentle one.** At rank 10, `1/rank` says 0.10 — nothing below the fold counts. `log2` says 0.29 |
| 17 | md | **Add the weights up** — 1 where you clicked, 0 where you didn't, times the weight. That sum is DCG |
| 18 | code | `dcg` over three hand-written gain lists |
| 19 | md | **Now DCG has recall's old problem** — more clicks means more weight available. Divide by the best this search could have scored |
| 20 | code | `ndcg_at_k`, two searches with different click counts, both perfect, both 1.0 |
| 21 | md | **The three side by side** — guess which pairs each metric fails to tell apart |
| 22 | code | table over the three toy lists |
| 23 | md | **Abandonment: the metric a label file can't have.** Searches where you clicked nothing. No answer key can express "I looked and left" |
| 24 | code | `abandonment(events)` on your real log |
| 25 | md | **Testing a change with nobody in the room.** Each event kept its whole candidate pool. Re-rank that pool with different code and ask where your clicks landed now |
| 26 | code | `replay(events, PipelineConfig(), "dense-only")` — the first real row |
| 27 | md | **Predict before the next cell.** You could only click what dense search showed you, in its own top five. Is that an advantage this row gets and book 7's doesn't? |
| 28 | code | `!python -m readnext.eval --replay --config dense-only` — same row, outside the notebook |
| 29 | md | **What replay cannot do.** It reorders yesterday's pool. It can't tell you about a paper the pool never contained |
| 30 | md | **Interleaving: the live comparison.** Two rankers, alternating slots, one list. You click without knowing which is which |
| 31 | code | build an interleaved list from two configs; show the slot ownership map |
| 32 | md | **Why position bias can't corrupt it.** Both rankers get the same share of good slots, so a preference for the top cancels out |
| 33 | code | run one interleaved session live, attribute the clicks |
| 34 | md | **The update in book 4 has a name.** Rocchio relevance feedback: `q' = α·q + β·mean(liked) − γ·mean(disliked)`. You already wrote it; now it gets swept |
| 35 | code | `sweep` over a small α/β/γ grid, printed as rows |
| 36 | md | **The failure only a loop reveals.** Crank β and by turn three every paper is the same paper. Predict what happens to nDCG and to diversity — they don't move together |
| 37 | code | three turns at high β; print titles per turn plus `intra_list_diversity` |
| 38 | md | **Two fixes.** The seen-set (already in book 4) stops repeats; an exploration slot reserves one of five for an outsider |
| 39 | code | `exploration_slot` on, same three turns, diversity column beside nDCG |
| 40 | md | **Does the loop help at all?** nDCG at turn 1 vs turn 3, from your own sessions |
| 41 | code | `replay_by_turn` |
| 42 | md | closing — you can now argue about a change instead of feeling it; book 6 is the first change that has to earn its row |

## Data written

Nothing new. Reads `data/events.jsonl`; interleaved sessions append events like
any other (with the config recorded, so they stay attributable).

## Done when

- `python -m readnext.eval --replay --config dense-only` prints a row from your
  own sessions.
- α is chosen from the sweep, and `config.py`'s default is updated to it.
- You have seen the bubble form and then fixed it.
- You can say what a `hit@20` of 0.61 means for a person using the app.

## Not in this book

Any new retrieval technique. This book adds no capability to the product except
the exploration slot — it adds the ability to argue.

## Open questions to settle while building

1. **How few events is too few?** A row over 6 events is noise. Decide a floor
   and make `replay` warn below it.
2. **Does `dislike` score 0 or negative in nDCG?** Starting position: 0, with
   dislikes reported separately as "how often did a disliked paper reach the top
   5".
3. **Interleaving needs live clicking, replay doesn't.** If interleaving proves
   too slow to use for every comparison, it becomes the tie-breaker for changes
   replay says are close, not the default.
4. **Does a persisted profile help or hurt?** Book 4 open question 3; this is
   where it gets a number, by replaying with and without a loaded profile.
