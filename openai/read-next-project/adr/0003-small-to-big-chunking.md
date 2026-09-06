# ADR-0003 — small-to-big chunking

**Status:** Accepted (2025-08-25) — decided in notebook 1

## Context

Something has to be chosen as the unit that gets embedded. Three candidates were
compared on the same papers, by eye and by token cost:

- `whole` — one vector per abstract
- `window` — 2-sentence windows, 1-sentence overlap
- `small_to_big` — embed the window, return the whole abstract

## Decision

`small_to_big`. `Chunk` carries two fields: `text` (the window, what gets
embedded) and `context` (the full abstract, what gets shown).

## Consequences

- A query matching one sentence of a long abstract doesn't have to compete
  against the whole abstract's averaged vector — precision improves.
- Results are still readable: search retrieves a fragment and hands back a
  paper.
- It costs exactly what `window` costs. The embedded text is identical; only
  the pointer differs, so precision here was free.
- The index is chunk-level while the product is paper-level, so every search
  path must collapse chunks to papers (`dedupe_to_papers`) and every `k` comes
  in two flavours: chunks pulled, papers kept.

## Alternatives considered

- **`whole`.** Cheapest, fewest rows, but blurs a specific claim into a topic
  average.
- **`window`.** Same cost and same precision, but returns a fragment with no
  route back to the paper — unusable in a product that recommends papers.
