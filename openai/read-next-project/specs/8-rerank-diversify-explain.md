# Book 8 — rerank, diversify, explain

**Status:** not built. Contracts binding, cell order a plan.
**Implements:** ADR-0010 (judge limited to faithfulness)

## What you can do after this that you couldn't before

Read *why* a paper was recommended, in a sentence grounded in its abstract —
and know that the sentence is checked, not trusted. And stop getting five
near-identical papers.

## Builds on

Everything. This book only touches the final ~40 candidates.

## Module contracts

`readnext/rerank.py`

```python
listwise_rerank(query, candidates, model=RERANK_MODEL) -> list[str]   # ids, best first
pointwise_rerank(query, candidates) -> list[str]                       # for contrast
mmr(candidates, vectors, lam: float, k: int) -> list[str]
```

`readnext/explain.py`

```python
class Explanation(BaseModel):
    why: str
    citations: list[str]      # chunk ids

explain(query, paper, chunks) -> Explanation
validate_citations(exp, prompt_chunk_ids) -> bool     # invented citation = bug
judge_faithfulness(exp, chunks, model=JUDGE_MODEL) -> float
```

## Notebook outline (plan)

| # | kind | idea |
| --- | --- | --- |
| 0 | md | title — everything so far decided *which* papers; this decides their order and what they say |
| 1 | md | **Rank one paper at a time.** Ask the model to score each candidate alone. Note what it can't see: the others |
| 2 | code | pointwise over 10 candidates; the score distribution is flat and useless |
| 3 | md | **Rank them together.** One prompt, 40 compact candidates, one ordering back. The model can compare, which is the whole job |
| 4 | code | `listwise_rerank`; the new top 5 beside the old |
| 5 | md | **What it cost.** Tokens and seconds per query, next to the nDCG gain |
| 6 | code | the row, with `$/query` and `ms/query` |
| 7 | md | **Five papers, one idea.** The classic recommender failure — show it happening on a real query |
| 8 | code | `intra_list_diversity` on that list |
| 9 | md | **MMR: pick the next paper for what it adds.** Relevance minus similarity to what's already chosen, traded by λ, shown as numbers on 4 candidates |
| 10 | code | `mmr` by hand on a tiny candidate set |
| 11 | md | **Sweep λ** — and expect nDCG to fall as diversity rises. The question is where you'd stop |
| 12 | code | sweep, both columns |
| 13 | md | **A reason, not a summary.** Structured output: one sentence, plus the chunk ids it used |
| 14 | code | `explain` on one recommendation |
| 15 | md | **A citation the model invented is a bug.** Check every id against what was actually in the prompt |
| 16 | code | `validate_citations` over 20 explanations; count failures |
| 17 | md | **Now grade the sentence itself.** Does `why` follow from the cited text? This is the one thing a model should judge — the correct answer is visible in the prompt |
| 18 | md | **And what it should not judge.** "Is this paper interesting to me" has no answer the judge can see. That stays with the clicks (ADR-0010) |
| 19 | code | `judge_faithfulness` over the same 20; the faithfulness column |
| 20 | md | **The cards, with reasons.** Wire `why` into `ui.render` |
| 21 | code | a live session showing grounded cards |
| 22 | md | closing — every technique now has a row; book 9 reads the whole table |

## Done when

- Cards show a grounded reason.
- No explanation cites a chunk that wasn't retrieved.
- `+ llm rerank` and `+ mmr diversity` are rows, with cost and latency.
- Faithfulness is a column.

## Open questions

1. Rerank all 40 or the top 20? Cost scales with the prompt.
2. Does MMR run before or after the LLM rerank? Starting position: after — the
   reranker's ordering is the relevance term MMR trades against.
3. Explanation for all five cards or on demand? Five calls per turn is the
   project's most expensive habit. Starting position: on demand, and measure
   whether anyone expands them.
