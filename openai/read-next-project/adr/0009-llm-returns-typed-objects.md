# ADR-0009 — The LLM returns typed objects, never prose for its own sake

**Status:** Accepted (2026-09-06)

## Context

RAG is normally taught inside a chat interface, and the app does need to accept
free text: "I want to read about LoRA", "less benchmark papers, more about the
judge models themselves", "nothing older than 2024".

But a chat transcript hides the things this project exists to expose. Retrieval
quality stops being separable from generation quality, failures stop being
legible, and there is no artifact to measure.

## Decision

The LLM is in the product, not only in evaluation — but every call in the loop
returns a **typed object that changes a vector or a filter**:

| Call | Returns |
| --- | --- |
| Query understanding | `StructuredQuery` — semantic text, filters, `in_scope`, `clarify` |
| Feedback parsing | `ParsedFeedback` — refinement, ids to boost/drop, exclude terms |
| Rerank | an ordering over candidate ids |
| Explanation | `why` plus the chunk ids it used |

Clarifying questions are allowed, and are **slot filling**, not conversation:
the model asks one question that fills one schema field, and stops when the form
is complete. The exchange terminates in a search, never in a reply.

Events log the **resolved** `StructuredQuery`, not the dialogue, so replay always
compares rankers on a fixed input.

## Consequences

- Every LLM step has a schema, so it can be validated, cached, replayed and
  priced independently.
- Clarification is measured on its own terms (did asking reduce abandonment),
  separately from ranking quality.
- The app cannot answer general questions, and shouldn't try. Out-of-scope
  queries get a scope response (book 6), not an improvised answer.

## Alternatives considered

- **A chat agent over a retrieval tool.** Closer to how RAG is usually demoed,
  but it makes the pipeline unmeasurable and overlaps
  `claude/shop-assistant-project`, which already covers agentic retrieval.
