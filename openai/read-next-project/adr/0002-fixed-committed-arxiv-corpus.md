# ADR-0002 — A small, fixed, committed arXiv corpus

**Status:** Accepted (2025-08-25)

## Context

Every number this project reports is relative to a corpus. If the corpus moves
between runs, no two measurements are comparable and every table row is noise.

The corpus also has to be obtainable in one script with no account, no download
portal, and no PDF pipeline.

## Decision

arXiv's public API. Categories `cs.CL`, `cs.LG`, `cs.AI`, `cs.IR`, 2023 onward,
fetched once and committed as `data/papers.jsonl` — 1,693 papers.

Papers are fetched category by category and merged by id, so a paper carries
every category it belongs to rather than the one it was found under.

The record contract is frozen in notebook 1: `id`, `title`, `abstract`,
`authors`, `categories`, `primary_category`, `published`, `updated`, `url`.

Only abstracts are used — no full text.

## Consequences

- Any two runs, on any machine, are comparable. The corpus is not a variable.
- Abstracts are 150–300 words, which makes chunking a real decision (see
  ADR-0003) without needing a PDF parser.
- ~1,700 papers is small enough that brute-force search is fast (ADR-0004) and
  large enough that retrieval quality is a genuine question.
- The corpus is stale by construction. Adding papers later means re-embedding
  and invalidates old table rows.

## Alternatives considered

- **The Kaggle arXiv dump (2M+ papers).** Needs an account and a multi-GB
  download; forces an approximate index before the exact one has been
  understood.
- **Fetching live per run.** Results stop being comparable, which defeats the
  whole measurement story.
