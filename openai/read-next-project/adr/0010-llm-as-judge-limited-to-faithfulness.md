# ADR-0010 — LLM-as-judge is limited to faithfulness

**Status:** Accepted (2026-09-06)

## Context

LLM-as-judge is a popular evaluation method and was considered for two different
jobs: grading whether a paper is relevant to a query, and grading whether a
generated explanation follows from its cited text.

These are not the same kind of question.

## Decision

Use it for **faithfulness only** (book 8): given the cited chunk and the
generated `why`, does the sentence follow from the text? Model: `gpt-5`.

Do **not** use it to decide relevance. That is automated labelling, and
ADR-0005 rules labelling out regardless of who does it.

## Consequences

- The distinction is worth teaching where it appears: faithfulness has a correct
  answer visible inside the prompt — the cited text is right there — whereas
  "is this paper interesting to this person" has no correct answer the judge can
  see.
- Explanations get a quality column that is not a proxy for ranking quality. A
  well-ranked list with an invented justification fails one and passes the other.
- Judge cost lands only in book 8, and only in evaluation — never in a user's
  request path.

## Alternatives considered

- **LLM-as-judge on relevance, spot-checked by the developer.** Cheap and
  common. Rejected: it reintroduces someone-other-than-the-user deciding what is
  relevant, and the spot-checking is the hand-labelling this project removed.
