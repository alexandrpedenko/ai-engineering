# ADR-0007 — Evals grow with the books, from book 2

**Status:** Accepted (2026-10-05). Amends ADR-0006's "books 12–13".

## Context

The roadmap put every eval in the last two books. That left books 2–11
judging prompt changes, the cheap model (book 10) and the supervisor (book 9)
by eye, which are exactly the decisions an eval should settle. It also
evaluated only whole itineraries, so a lower end-to-end score couldn't say
which node broke. And because nothing ran the same input twice, the
variation between runs was never measured.

## Decision

- **`evals/` starts in book 2**, and every book that adds or changes model
  behaviour adds the dataset and evaluators for it in the same book.
  Books that add no model behaviour (5, 6, 7) add no evaluator.
- **Datasets are local JSONL files** in `evals/datasets/`, committed and
  readable by eye (P1 ADR-0002). Each file is one dataset with a version
  field; the runner uploads it to LangSmith under `<name>@<version>`.
- **One runner**, `evals/run.py`, calls `langsmith.evaluate` with
  `num_repetitions` (default 3) and records tokens, cost and latency next to
  the quality scores. `upload_results=False` gives a local-only run.
- **Each model node has its own dataset**, plus one end-to-end dataset:
  `parse` (book 2), `hotel_requests` (3), `briefs` (4, end-to-end),
  `followups` (8, multi-turn), `redteam` (12).
- **Code evaluators come first.** A model judge is used only for what code
  can't check, and only after it has been compared with hand grades (book 13).
- **Three tiers**, wired up in book 14: `pytest` (no model, every change,
  ADR-0006); `pytest -m smoke` (~10 cases, one repetition, every prompt or
  model change); `pytest -m eval` (all datasets, repetitions, gated against
  `evals/baseline.json`).

## Consequences

- Books 9 and 10 decide with experiments: supervisor vs planner and cheap vs
  strong model on the same dataset, with quality and cost side by side.
- The `data/briefs/` files have two users from book 2: the CLI and the
  `parse` dataset.
- Every eval costs money and time. The smoke tier keeps the frequent run
  cheap; the full tier runs when a book is accepted.
- `openevals` / `agentevals` are checked for fit when book 2's spec is
  written, not in book 12.

## Alternatives considered

- **Evals only at the end (the old roadmap).** Simpler to plan, but it
  teaches evals as a final report instead of the tool that decides changes.
- **Datasets only in LangSmith.** Nothing to read in the repo, and no record
  in git of which dataset version gave which baseline.
