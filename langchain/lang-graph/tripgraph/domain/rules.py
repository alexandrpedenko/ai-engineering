"""The rules a trip brief has to meet. Plain functions: no model, no files."""

from datetime import date, timedelta

from tripgraph.domain.models import TripBrief

# Each problem missing_fields can report, and the question that fixes it.
PROBLEMS: dict[str, str] = {
    "cities": "Which cities do you want to visit?",
    "start": "What date does the trip start? (YYYY-MM-DD)",
    "end": "What date does it end — the day you leave the last city? (YYYY-MM-DD)",
    "budget": "What's the total budget in euros?",
    "dates_order": "The end date has to be after the start date — which dates did you mean?",
    "too_few_nights": "Every city needs at least one night, and there are fewer nights than cities — fewer cities, or more days?",
}


def _parse_date(value: str | None) -> date | None:
    if value is None:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def missing_fields(brief: TripBrief) -> list[str]:
    """Return the problems with a brief, as keys of PROBLEMS.

    The order is fixed: cities, start, end, budget, then dates_order and
    too_few_nights, which are only checked once both dates are readable.
    A date that isn't a valid ISO date counts as missing. An empty list
    means the brief is complete.
    """
    problems = []
    start = _parse_date(brief.start)
    end = _parse_date(brief.end)

    if not brief.cities:
        problems.append("cities")
    if start is None:
        problems.append("start")
    if end is None:
        problems.append("end")
    if brief.budget is None or brief.budget <= 0:
        problems.append("budget")

    if start is not None and end is not None:
        if end <= start:
            problems.append("dates_order")
        elif brief.cities and (end - start).days < len(brief.cities):
            problems.append("too_few_nights")

    return problems


def nights(brief: TripBrief) -> int:
    """Number of nights between start and end. Assumes both are valid dates."""
    return (date.fromisoformat(brief.end) - date.fromisoformat(brief.start)).days


def split_nights(brief: TripBrief) -> list[tuple[str, str, str]]:
    """Share the trip's nights across its cities, in the brief's order.

    Returns (city, check_in, check_out) per city. Each city gets
    nights // cities nights; the leftover nights go one each to the first
    cities. Each check-out is the next city's check-in, and the last
    check-out is the brief's end. Assumes missing_fields(brief) == [].
    """
    base, extra = divmod(nights(brief), len(brief.cities))
    check_in = date.fromisoformat(brief.start)
    stays = []
    for i, city in enumerate(brief.cities):
        check_out = check_in + timedelta(days=base + (1 if i < extra else 0))
        stays.append((city, check_in.isoformat(), check_out.isoformat()))
        check_in = check_out
    return stays
