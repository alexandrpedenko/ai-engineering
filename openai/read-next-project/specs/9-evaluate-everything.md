# Book 9 — evaluate everything

**Status:** not built. Contracts binding, cell order a plan.
**Implements:** ADR-0012 (simulated personas optional and segregated)

## What you can do after this that you couldn't before

Answer, with a table, which of the eight techniques you built paid for
themselves — and which you would cut under a latency budget.

## Builds on

All of it. Adds no capability to the product.

## Module contracts — `readnext/personas.py` (optional half)

```python
@dataclass
class Persona:
    name: str
    hidden_interest: str          # written before any search runs
    seed_queries: list[str]

simulate(persona, config, turns=3, model=SIMULATED_USER_MODEL) -> list[Event]
converged(events, persona, judge) -> dict[int, float]   # per-turn hit on the hidden interest
```

Simulated events go to `data/sim_events.jsonl`, never `events.jsonl`.

## Notebook outline (plan)

| # | kind | idea |
| --- | --- | --- |
| 0 | md | title — every book claimed a row; this checks the claims together |
| 1 | code | `!python -m readnext.eval --replay --config all` — the whole table |
| 2 | md | **Read it as deltas, not absolutes.** Which row moved which column, and what that says about what the technique actually did |
| 3 | md | **A row that didn't move.** Keep it and write down why — the most useful cell in the project |
| 4 | md | **Cost and latency are columns too.** At a 500ms budget, which rows survive |
| 5 | code | the same table sorted by `ms/query` |
| 6 | md | **Now the loop, not the retriever.** A row scores one search; a session is three, and each changes the next |
| 7 | code | `replay_by_turn` over real sessions — turn 1 vs turn 3, diversity beside it |
| 8 | md | **Not enough sessions to be sure.** Say the sample size out loud before drawing a conclusion from it |
| 9 | md | **Manufacture the users, never label the data.** A persona with an interest written down *before* the search — correctness by construction, not by judgement |
| 10 | code | `personas.json`; one persona's three turns, printed |
| 11 | md | **What converged means here.** Did the app find the hidden interest by turn 3 — measured against the sentence you wrote, not a verdict |
| 12 | code | `simulate` × 200; per-turn convergence, with the diversity trade |
| 13 | md | **The bubble at volume.** The β failure from book 5, now visible as a curve |
| 14 | code | convergence per turn across β values |
| 15 | md | **What this is not.** A model's idea of a researcher. Real-session numbers stay the headline (ADR-0012) |
| 16 | md | **The written read.** Which techniques paid for themselves, which didn't, what you'd cut |
| 17 | md | closing — and what a second phase would be |

## Done when

- One command reproduces every number in `spec.md`'s example table.
- A written read of the table exists, naming at least one technique that didn't
  earn its place.
- `index.md` is written.

## Open questions

1. How many personas, and how different? Too similar and the volume is fake.
2. Does the simulated user see abstracts or just titles? A real user skims
   titles first. Starting position: title plus first 240 characters, matching
   the card.
3. Cut the whole simulated half if it reads as noise (ADR-0012 permits it).
