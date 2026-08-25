# Project notes

- Do not execute `.ipynb` notebooks to test changes (e.g. `jupyter nbconvert --execute`). Editing cells via NotebookEdit is fine; leave running them to the user.
- The NotebookEdit tool has been observed writing a cell's `source` as a single string with literal `\n` characters instead of real newlines, which renders as broken/garbled text and code. When building notebook cells, write the `.ipynb` file directly (e.g. via a Python script using `str.splitlines(keepends=True)` for each cell's `source`) and verify by reading the raw JSON back before treating the notebook as done.

## Notebook markdown style

- One `#` (h1) per notebook, on the first cell only, as the title.
- No `##`/`###` subheadings for ordinary explanatory cells — use a short **bold lead-in** phrase at the start of the paragraph instead (e.g. `**Fetching.** arXiv's API is...`). Keep body text normal size/weight; don't make explanations look like section headers.
- Reserve real headings (`##`) for genuine structural pivots within a notebook — a rare case, not the default for every new topic.
