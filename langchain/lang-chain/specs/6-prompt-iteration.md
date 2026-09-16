# Book 6 — prompt iteration

**Status:** draft
**Decides:** nothing new; uses ADR-0007 (LangSmith) for the prompt hub

## What you can do after this that you couldn't before

Treat the system prompt as code: three versions, the same five requests
through each, a table of what each version got right, and the winner stored
by name in the LangSmith prompt hub so a notebook can pull it instead of
pasting it.

## Builds on

Book 3's `get_prompt("v1")` and `build_agent(prompt_version=...)`. Book 5's
full agent — the requests include a booking so the approval gate is part of
the picture.

## Module contracts

`hotelbot/prompts.py` — adds `"v2"` and `"v3"`, and hub resolution:

```python
def get_prompt(version: str = "v1") -> str
# "v1" | "v2" | "v3"  → local
# "hub:<name>" or "hub:<name>:<commit>"  → langsmith Client().pull_prompt(...)
```

- `v1` — bare (book 3).
- `v2` — `v1` + rules: check availability before proposing; never exceed the
  stated budget; if nothing matches say so instead of proposing; quote
  policy only via `lookup_policy`.
- `v3` — `v2` + two few-shot examples: a request and the `BookingProposal`
  it should produce, one straightforward, one where the right answer is
  "nothing matches".

`hotelbot/samples.py`

```python
REQUESTS: list[str]   # five fixed requests, used again in books 7 and 8
```

The five cover: a clean match; a budget that nothing meets; dates outside
every availability range; a policy question folded into a booking request;
a vague request ("somewhere nice in Porto") that needs a follow-up rather
than a proposal.

## Notebook outline

| # | kind | idea |
| --- | --- | --- |
| 0 | md | title — every book so far ran on a prompt that was never examined; this book makes three and measures them |
| 1 | code | `configure_tracing(6)`, `REQUESTS`, a helper that runs one request through `build_agent(prompt_version=v)` on a fresh thread and returns the `structured_response` (approving nothing — proposals only) |
| 2 | md/code | **What v1 does.** Print `get_prompt("v1")`. Run the five; show each `BookingProposal` / `PlainAnswer` in a row. Predict which of the five it gets wrong before running. Expected: proposes over budget, proposes unavailable dates, or answers the policy question from memory. |
| 3 | md/code | **Rules.** Print the diff v1→v2 (just the added lines). Run the five. Which rows changed? Look at one trace where v2 now calls `check_availability` before proposing and v1 didn't. |
| 4 | md/code | **Examples.** Print the two few-shot examples. Run the five. The "nothing matches" case is where an example helps more than a rule — v2 was told to say so; v3 was shown how. |
| 5 | md/code | **Scoring by hand.** A 5×3 table, one cell per request per version: ✓ if the proposal is available, within budget, and the `why` is true of the hotel; ✗ with a word otherwise. Totals per column. Small numbers, read by eye — this is a look, not an eval. |
| 6 | md/code | **Cost of a longer prompt.** Prompt tokens per call for the same request under v1 / v2 / v3 from `usage_metadata`. v3 is longest on every turn of every conversation; whether the table in cell 5 justifies it is the judgment. |
| 7 | md/code | **The hub.** `Client().push_prompt("hotelbot-booking", object=ChatPromptTemplate.from_messages([("system", get_prompt("v3"))]))` — a URL comes back with a commit hash. `get_prompt("hub:hotelbot-booking")` pulls it; `build_agent(prompt_version="hub:hotelbot-booking")` runs on it. Push v2 under the same name; the hash changes; pull by the old hash and get v2's text back. |
| 8 | md | closing — the prompt is versioned, compared and stored by name. What's still not covered: the cases where a tool fails or a document lies to the model — book 7. |

## Done when

- Cell 2 shows at least two of five requests wrong under v1 in a way cell 5
  names.
- Cell 5's totals are non-decreasing v1 → v2 → v3 (if not, the prompts need
  another pass before the book is done — that is the point of the book).
- Cell 7 round-trips: pushed text equals pulled text; pulling by commit hash
  returns the older version.
- `build_agent(prompt_version="hub:...")` works with a `LANGSMITH_API_KEY`
  and fails with a clear message without one.

## Not in this book

Automated evaluation, LLM-as-judge, datasets and experiments in LangSmith —
five requests scored by eye is deliberately the ceiling. Prompt templates
with variables beyond `TODAY`. Per-tool prompt tuning (docstrings are frozen
by ADR-0006).
