"""Pydantic models shared across the project."""

from pydantic import BaseModel


class Hotel(BaseModel):
    id: str
    name: str
    city: str
    district: str
    price_per_night: float
    rating: float
    amenities: list[str]
    available: list[list[str]]  # inclusive [check_in, check_out) ranges, ISO dates
