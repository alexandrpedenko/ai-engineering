# Project notes

- Do not execute `.ipynb` notebooks to test changes (e.g. `jupyter nbconvert --execute`). Editing cells via NotebookEdit is fine; leave running them to the user.
- The NotebookEdit tool has been observed writing a cell's `source` as a single string with literal `\n` characters instead of real newlines, which renders as broken/garbled text and code. When building notebook cells, write the `.ipynb` file directly (e.g. via a Python script using `str.splitlines(keepends=True)` for each cell's `source`) and verify by reading the raw JSON back before treating the notebook as done.

## Work in slices, never all at once

These notebooks are how I learn, and I can only review what I can read in one
sitting. A book is built as a sequence of small slices, and **you stop after
each one and wait** — no chaining slice 2 onto slice 1 because slice 1 went
fine.

- **A slice is one capability**, small enough to review in a sitting: the
  package code it needs plus the cells that teach it. Roughly 3–6 notebook
  cells and one module, not a whole book.
- **Slice boundaries come from the book spec's cell outline** in `specs/`.
  Group the outline into slices before writing anything, show me the grouping,
  and let me approve it — that list is the plan for the book.
- **Each slice ends with a handover**: what it added, what I should run and look
  at, and what the next slice does. Then stop. Don't start the next one until I
  say so.
- **A slice must run on its own.** Never leave a notebook in a state where a
  cell imports something that isn't written yet, or references a later slice's
  function.
- **Specs get sliced the same way.** A book spec is written and reviewed before
  its first slice is built, not alongside it.

If a slice turns out bigger than it looked, split it and tell me — that is
always better than delivering something I have to review in one gulp.

## Notebook markdown style

- One `#` (h1) per notebook, on the first cell only, as the title.
- No `##`/`###` subheadings for ordinary explanatory cells — use a short **bold lead-in** phrase at the start of the paragraph instead (e.g. `**Fetching.** arXiv's API is...`). Keep body text normal size/weight; don't make explanations look like section headers.
- Reserve real headings (`##`) for genuine structural pivots within a notebook — a rare case, not the default for every new topic.

## Teaching explanations

These notebooks are how I learn the material, and I come to it without a
background in information retrieval, recommender systems, or the maths behind
them. The explanation is the deliverable; the code is what the explanation is
about. Assume arithmetic and Python, nothing else.

- **Derive, don't assert.** Introduce each idea because the simpler thing just
  broke. Show the simple version, show a concrete case where it gives the wrong
  answer, then introduce the fix. Never state a finished formula and then
  explain its parts — that only works for a reader who already knows it.
- **No unexplained notation.** Any symbol, function or operation — `log2`, a
  sum over ranks, cosine similarity, α/β/γ — gets shown as numbers before it's
  used: what it takes in, what it gives back for two or three real values, and
  why that shape rather than an obvious alternative. A formula with no numbers
  beside it teaches nothing.
- **Define the term the first time it appears.** "Golden set", "listwise",
  "pre-filter" and the like are jargon until they're introduced once, plainly.
- **Concrete before general.** Toy data small enough to verify by hand first,
  the real corpus after.
- **One new idea per cell**, named in the bold lead-in. Two ideas means two
  cells.
- **Predict before running.** Where a cell's output is a number worth guessing,
  ask for the guess in the markdown above it and don't reveal the answer before
  the code runs.
- **Keep design rationale out of the notebook.** Why we chose `k=30`, why a
  query type was dropped, what the trade-off was — that's a conversation for
  chat, not a cell. A cell says how the thing works and what to look for in the
  output.
- **No status cells.** "Slice 2 done — `readnext.golden` now holds X" is a
  commit message. A closing cell says what you can do now that you couldn't
  before, and what the next notebook needs that this one doesn't have.
- **Package docstrings and comments follow the same rules.** Say plainly what a
  function does and what it ignores; don't argue design decisions in a
  docstring, and don't assume the reader knows the vocabulary.
