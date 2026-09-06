# ADR-0005 — Evaluation comes from the interaction log, never from hand labels

**Status:** Accepted (2026-09-06)
**Supersedes:** the hand-authored golden set in the original spec (`golden.jsonl`
with hand-written `relevant_ids`, and its successor, an in-app "which of these
are relevant?" prompt). Both removed.

## Context

The first plan asked the developer to write ~25 queries and mark which papers
were relevant to each, in a checklist file. The second plan moved the same
activity into the app as an `input()` prompt. Both are the developer inventing
ground truth for a recommender, which is not how recommenders are evaluated and
not something a single developer can do without biasing every number in the
project.

Real recommenders are measured from logged user behaviour. The user already
tells the system what is relevant — by clicking.

## Decision

There is no golden set. Every search appends one `Event` to
`data/events.jsonl`: query, resolved query, the full candidate pool, the five
shown, and every signal (`like` / `dislike` / `reading`). That log is the test
set, and it is committed.

Three label-free uses:

- **Live metrics** — was anything clicked, and how far down; abandonment rate.
- **Replay** — re-rank a logged event's stored `candidates` pool with a
  different `PipelineConfig` and check where the clicked papers land. Repeatable
  with no human present.
- **Interleaving** — two rankers alternate slots in one rendered list; clicks
  are attributed to whichever ranker owned the slot. Immune to position bias.

**Rule:** if a notebook ever asks you to mark which papers are relevant, the
design has gone wrong.

## Consequences

- Metric denominators are clicks, not opinions. `hit@20` means "of the papers I
  clicked, what fraction lands in the top 20" — not "of all relevant papers".
- True recall is not measurable. A paper never shown can never be clicked, so
  the log scores *ordering* honestly and cannot report "there was a better paper
  you never saw".
- That gap narrows as the project grows: BM25 (book 7) surfaces papers dense
  search never did, and using the app after that widens the log's coverage.
  Coverage improves with the system instead of being frozen on day one.
- Book 4 must ship before any measurement exists, and must log completely from
  its first run — a missing `candidates` field makes an event unreplayable
  forever.
- Sparse data. One developer's clicks are few; ADR-0012 covers the optional
  remedy.

## Alternatives considered

- **Hand-labelled golden set (TREC-style).** Standard for benchmarking retrieval
  with no users. Rejected: there is a user.
- **LLM-as-judge on relevance.** Automated labelling — cheaper annotator, same
  objection. Rejected (see ADR-0010).
