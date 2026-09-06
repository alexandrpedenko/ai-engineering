# Book 6 — the LLM front door

**Status:** not built. Contracts below are binding; the cell order is a plan to
revisit once book 5's numbers exist.
**Implements:** ADR-0009 (typed objects, not prose)

## What you can do after this that you couldn't before

Type what you actually mean — "recent work on retrieval evaluation, nothing
older than 2024, prefer cs.IR" — and have the restrictions applied as filters
instead of averaged into a vector. Get told "I have nothing on that" when you
ask for Alice in Wonderland. Steer a session in words: "less benchmark papers,
more about the judge models themselves".

## Builds on

Book 4's session and events, book 5's replay harness (this is the first change
that must earn a row).

## Module contracts — `readnext/query.py`

```python
class StructuredQuery(BaseModel):
    semantic_text: str
    categories: list[str] = []
    published_after: date | None = None
    exclude_terms: list[str] = []
    in_scope: bool = True
    clarify: str | None = None

class ParsedFeedback(BaseModel):
    refine_query: str | None = None
    boost_ids: list[str] = []
    drop_ids: list[str] = []
    exclude_terms: list[str] = []

parse_query(text) -> StructuredQuery
parse_feedback(text, shown) -> ParsedFeedback
to_filter(sq) -> Filter                      # for NumpyStore.search(where=...)
cheap_scope_check(store, query_vector, threshold) -> bool
```

`Session.ask` gains: parse → if `not in_scope`, say so and stop → if `clarify`,
ask one question and stop → else search with `where=to_filter(sq)`.
`Session.refine(text)` applies `ParsedFeedback` to the same Rocchio update plus
a filter change.

Events log the resolved `StructuredQuery` in `resolved_query`, never the
dialogue (ADR-0009).

## Notebook outline (plan)

| # | kind | idea |
| --- | --- | --- |
| 0 | md | title — book 4 sent your raw string to the embedder; here is what that costs |
| 1 | md | **A restriction is not a topic.** "nothing older than 2024" embedded as text does nothing useful — show it failing on the real index |
| 2 | code | the query as one vector; count how many results predate 2024 |
| 3 | md | **Structured output splits them.** One call, one schema, one typed object back |
| 4 | code | `StructuredQuery` and `parse_query` on three example queries |
| 5 | md | **Pre-filter vs post-filter.** Filtering after the search silently returns fewer than k and biases toward whatever survived |
| 6 | code | both, side by side, on the same query — count what each returns |
| 7 | md | **`NumpyStore.search` already takes `where`** — book 3 left the seam open on purpose |
| 8 | code | `to_filter` + a filtered search |
| 9 | md | **A question the corpus can't answer.** "I'd like to read Alice in Wonderland" against 1,693 CS papers |
| 10 | code | what the app does today: five confident irrelevancies |
| 11 | md | **Try the cheap fix first.** Best cosine similarity in the whole corpus, against a threshold. No model call |
| 12 | code | threshold check over in-scope and out-of-scope queries; find where it wrongly rejects a paraphrase |
| 13 | md | **Now the model's `in_scope`** — and what it costs per query to buy that |
| 14 | code | both on the same set; agreement, disagreement, dollars |
| 15 | md | **Too vague to serve.** One clarifying question that fills one schema field, then it stops. Slot filling, not conversation |
| 16 | code | a vague query → `clarify`; answer it; the resolved query |
| 17 | md | **Steering in words.** The second feedback channel — free text into `ParsedFeedback`, feeding the same Rocchio update |
| 18 | code | `parse_feedback("less benchmark papers, more about the judge models themselves", shown)` |
| 19 | md | **Still not a chat bot.** Every call returned a typed object that changed a vector or a filter |
| 20 | md | **What did the front door buy?** Predict the row before running it: does nDCG move, does abandonment move, what does it cost per query |
| 21 | code | `!python -m readnext.eval --replay --config all` |
| 22 | md | **Clarification is measured separately.** Replay compares rankers on the resolved query; asking a question is judged on abandonment, not nDCG |
| 23 | md | closing — a front door that understands restrictions still can't match a bare acronym; book 7 |

## Done when

- Filters apply *before* the search, in both code paths.
- An out-of-scope query says so instead of guessing.
- `+ structured query` is a row in the table, with its dollar cost.
- Events carry `resolved_query`.

## Not in this book

Multi-query expansion and HyDE — candidate ablations, deferred to book 9 if
there is appetite. BM25 (book 7). Reranking (book 8).

## Open questions

1. Does the scope threshold need to be per-query-length? Short queries score
   lower against everything.
2. Should `clarify` ever fire more than once per query? Starting position: no —
   one question maximum, then search with what you have.
3. `published_after` needs `published` in the store's chunk metadata, which book
   3 did not put there. Adding it means rebuilding the index — cheap (cached
   vectors), but note it.
