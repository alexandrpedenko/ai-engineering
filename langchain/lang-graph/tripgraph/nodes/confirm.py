"""Reply to a complete brief with its nights split across the cities."""

from datetime import date

from langchain_core.messages import AIMessage

from tripgraph.domain.rules import nights, split_nights
from tripgraph.state import PlannerState


def _span(check_in: str, check_out: str) -> str:
    """'10–13 Oct', or '30 Oct–2 Nov' when the stay crosses a month."""
    a, b = date.fromisoformat(check_in), date.fromisoformat(check_out)
    if a.month == b.month:
        return f"{a.day}–{b.day} {b:%b}"
    return f"{a.day} {a:%b}–{b.day} {b:%b}"


def _plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def confirm_brief(state: PlannerState) -> dict:
    """Reply with one line per city (dates and nights) and a line for the budget.

    Assumes the brief is complete. It doesn't look for hotels, trains or
    prices; it only restates the brief.
    """
    brief = state["brief"]
    lines = []
    for city, check_in, check_out in split_nights(brief):
        stay = (date.fromisoformat(check_out) - date.fromisoformat(check_in)).days
        lines.append(f"{city}: {_span(check_in, check_out)} ({_plural(stay, 'night')})")
    budget = f"{brief.budget:,.0f}" if brief.budget == int(brief.budget) else f"{brief.budget:,.2f}"
    lines.append(
        f"Budget: €{budget} for {_plural(nights(brief), 'night')}, "
        f"{_plural(brief.travellers, 'traveller')}."
    )
    return {"messages": [AIMessage("\n".join(lines))]}
