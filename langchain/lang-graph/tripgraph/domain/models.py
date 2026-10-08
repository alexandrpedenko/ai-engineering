"""The trip's data as Pydantic models. No behaviour lives here."""

from pydantic import BaseModel


class TripBrief(BaseModel):
    """What the traveller asked for.

    Every field has a default, so a brief with parts missing is still a
    TripBrief. Saying what's missing is the job of rules.missing_fields.
    """

    cities: list[str] = []
    start: str | None = None  # ISO date, e.g. "2026-10-10"
    end: str | None = None  # ISO date: the day you leave the last city
    budget: float | None = None  # euros, for the whole trip
    travellers: int = 1
    interests: list[str] = []
    earliest_departure: str | None = None  # "HH:MM"; no train or flight before it
    amenities: list[str] = []
