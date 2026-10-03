"""The agent's system prompt, in numbered versions.

v1 is the short prompt from book 3. v2 is v1 with four rules appended, and
v3 is v2 with two worked examples appended, so each version's text is the
start of the next one's. The examples contain no curly braces, because a
prompt template would read anything in braces as a blank to fill in.

A version can also name a prompt stored in the LangSmith prompt hub:
"hub:<name>" for its latest commit, "hub:<name>:<commit>" for an older one.
"""

import os

from hotelbot.config import TODAY

_V1 = (
    "You are a hotel booking assistant for Lisbon, Porto, Madrid, and "
    "Seville. Ask only for what you need to search: city, dates, and "
    f"budget. Keep replies short. Today is {TODAY}. Produce dates in "
    "ISO format (YYYY-MM-DD)."
)

_RULES = """

Rules:
- Before proposing a hotel, call check_availability for it on the guest's dates. Propose it only if the result says it is available, and use the nights and total from that result.
- Never propose a hotel whose price per night is over the guest's stated budget.
- If no hotel meets every requirement, say so plainly and propose nothing. Do not offer a near miss as a proposal.
- Answer any question about hotel policy (pets, cancellation, payment, check-in, accessibility) only from what lookup_policy returns, never from general knowledge."""

_EXAMPLES = """

Two examples of a request and the answer it should get:

Example 1
Guest: Three nights in Seville, 2026-10-02 to 2026-10-05, under €110 a night, with a gym. I'll arrive around 23:00.
You call search_hotels, then check_availability for sev-001, then lookup_policy about late arrival.
You answer with a BookingProposal:
  hotel_id: sev-001
  check_in: 2026-10-02
  check_out: 2026-10-05
  nights: 3
  total: 240.0
  why: Santa Cruz House, €80 a night with a gym, available for all three nights. Arriving after 22:00 must be arranged with the hotel at least a day in advance.

Example 2
Guest: Two nights in Madrid, 2026-12-22 to 2026-12-24, under €200 a night.
You call search_hotels, then check_availability for each hotel under €200; none is available on those dates.
You answer with a PlainAnswer:
  text: Nothing in Madrid under €200 a night is available 22-24 December; the hotels there take bookings only until 20 December. Would earlier dates work?"""

_V2 = _V1 + _RULES
_V3 = _V2 + _EXAMPLES

_VERSIONS = {"v1": _V1, "v2": _V2, "v3": _V3}


def get_prompt(version: str = "v1") -> str:
    """Return the system prompt text for the given version.

    "v1", "v2" and "v3" are defined in this file. Anything starting with
    "hub:" is pulled from the LangSmith prompt hub, which needs
    LANGSMITH_API_KEY. Either way the result is plain text.
    """
    if version.startswith("hub:"):
        return _pull_from_hub(version.removeprefix("hub:"))
    return _VERSIONS[version]


def _pull_from_hub(identifier: str) -> str:
    """Fetch a prompt from the hub and return its system message's text.

    The hub stores a prompt template, a list of messages; ours holds one
    system message with no blanks to fill. The hub is asked every time,
    never a locally cached copy, so a fresh push is seen on the next pull.
    """
    if not os.environ.get("LANGSMITH_API_KEY"):
        raise RuntimeError(
            f"get_prompt('hub:{identifier}') needs LANGSMITH_API_KEY in the "
            "repo-root .env: the prompt hub is part of LangSmith. Use 'v1', "
            "'v2' or 'v3' to run without it."
        )
    from langsmith import Client

    template = Client().pull_prompt(identifier, skip_cache=True)
    return template.format_messages()[0].content
