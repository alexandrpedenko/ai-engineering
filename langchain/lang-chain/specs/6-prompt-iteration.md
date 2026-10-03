# Book 6 — prompt iteration

**Status:** in progress
**Decides:** nothing new; uses ADR-0007 (LangSmith) for the prompt hub

## What you can do after this that you couldn't before

Treat the system prompt as code: three versions, the same five requests
through each, a table of what each version got right, and the winner stored
by name in the LangSmith prompt hub so a notebook can pull it instead of
pasting it.

## Builds on

Book 3's `get_prompt("v1")` and `build_agent(prompt_version=...)`. Book 5's
full agent and `run()` on a fresh thread. The five requests ask for
proposals only — nothing is booked, so the approval gate never fires in this
book.

## Module contracts

`hotelbot/prompts.py` — adds `"v2"` and `"v3"`, and hub resolution:

```python
def get_prompt(version: str = "v1") -> str
# "v1" | "v2" | "v3"  → local
# "hub:<name>" or "hub:<name>:<commit>"  → langsmith Client().pull_prompt(...)
```

A pulled prompt is a `ChatPromptTemplate`; `get_prompt` returns its system
message's text, so the return type is `str` whichever way the prompt was
found.

- `v1` — bare (book 3).
- `v2` — `v1` + rules: check availability before proposing; never exceed the
  stated budget; if nothing matches say so instead of proposing; quote
  policy only via `lookup_policy`.
- `v3` — `v2` + two few-shot examples: a request and the `BookingProposal`
  it should produce: one where a hotel fits but comes with a policy caveat
  (the caveat goes in `why`, `total` stays the room cost from
  `check_availability`), one where the right answer is "nothing matches".
  Neither example is one of the five requests. The examples are written as
  `field: value` lines with no curly braces: `ChatPromptTemplate` reads
  `{...}` as a variable to fill, and the text has to survive a push and pull
  unchanged.

`hotelbot/samples.py`

```python
REQUESTS: list[str]   # five fixed requests, used again in books 7 and 8
```

The five cover: a clean match; a budget that nothing meets; dates outside
every availability range; a policy question folded into a booking request;
a vague request ("somewhere nice in Porto") that needs a follow-up rather
than a proposal. Budgets are stated per night so a proposal can be checked
against them by eye.

| # | request | right answer |
| --- | --- | --- |
| 1 | 2 nights Lisbon, 2026-10-10 → 10-12, under €150/night, breakfast | `lis-002` or `lis-004` |
| 2 | 3 nights Madrid, 2026-10-05 → 10-08, under €90/night | nothing — cheapest is €100 |
| 3 | 2 nights Seville, 2026-11-10 → 11-12, under €150/night | nothing — no hotel is open in November |
| 4 | 2 nights Porto, 2026-10-16 → 10-18, under €160/night, a 30 kg dog — cost and pick? | `por-004`/`por-005`, €25 pet fee, but 30 kg is over the 20 kg limit — needs the hotel's sign-off |
| 5 | "Somewhere nice in Porto" | a question back: dates, budget |

## Notebook outline

| # | kind | idea |
| --- | --- | --- |
| 0 | md | title — every book so far ran on a prompt that was never examined; this book makes three and measures them |
| 1 | code | `configure_tracing(6)`, `REQUESTS`, a helper that runs the five through `build_agent(prompt_version=v)`, each on a fresh thread, and returns the `AgentResult`s (the `structured_response` for the table, the messages for cells 3 and 6), plus a printer: one row per request — tools called, then the answer |
| 2 | md/code | **What v1 does.** Print `get_prompt("v1")`. Run the five; show each `BookingProposal` / `PlainAnswer` in a row. Predict which of the five, if any, it gets wrong before running. No outcome is assumed — whatever v1 does is the baseline. |
| 3 | md/code | **Rules.** Print the diff v1→v2 (just the added lines). Run the five. Which rows changed? Print each request's tool calls and answer type under v1 and v2 one above the other; look for a row where a rule changed what the agent did, and one where it changed nothing. |
| 4 | md/code | **Examples.** Print the two few-shot examples. Run the five. Did showing the model an answer change anything that telling it (v2) didn't? Look at the "nothing matches" rows in particular. |
| 5 | md/code | **Scoring by hand.** A 5×3 table, one cell per request per version: ✓ if the reply matches the request's right answer (the table above) and everything it states is true — hotel, dates, total, policy; ✗ with a word otherwise. Totals per column, whatever they come out as: a flat row is a result too. Small numbers, read by eye — this is a look, not an eval. |
| 6 | md/code | **Cost of a longer prompt.** Prompt tokens per call for the same request under v1 / v2 / v3 from `usage_metadata`. v3 is longest on every turn of every conversation; whether the table in cell 5 justifies it is the judgment. |
| 7 | md/code | **The hub.** `Client().push_prompt("hotelbot-booking", object=ChatPromptTemplate.from_messages([("system", get_prompt("v3"))]))` — a URL comes back with a commit hash. `get_prompt("hub:hotelbot-booking")` pulls it; `build_agent(prompt_version="hub:hotelbot-booking")` runs on it. Push v2 under the same name; the hash changes; pull by the old hash and get v2's text back. |
| 8 | md | closing — the prompt is versioned, compared and stored by name, and you can say from cells 5 and 6 whether the longer prompts paid for themselves on this model. What's still not covered: the cases where a tool fails or a document lies to the model — book 7. |

## Slices

Built and reviewed one at a time.

1. **Baseline** — `samples.py`; cells 0–2.
2. **Rules** — `"v2"` in `prompts.py`; cell 3.
3. **Examples** — `"v3"` in `prompts.py`; cell 4.
4. **Scoring and cost** — cells 5–6.
5. **The hub** — `hub:` resolution in `get_prompt`; cells 7–8.

## Done when

- Cell 5's table is filled from what actually ran, with no direction
  required of the totals: if v2 or v3 changed nothing, the table shows that.
- The closing cell says, from cells 5 and 6, whether the extra prompt tokens
  bought anything on these five requests.
- Cell 7 round-trips: pushed text equals pulled text; pulling by commit hash
  returns the older version.
- `build_agent(prompt_version="hub:...")` works with a `LANGSMITH_API_KEY`
  and fails with a clear message without one.

## Not in this book

Automated evaluation, LLM-as-judge, datasets and experiments in LangSmith —
five requests scored by eye is deliberately the ceiling. Prompt templates
with variables beyond `TODAY`. Per-tool prompt tuning (docstrings are frozen
by ADR-0006).
