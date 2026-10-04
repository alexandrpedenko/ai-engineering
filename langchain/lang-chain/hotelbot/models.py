"""Pydantic models shared across the project."""

from typing import Literal

from pydantic import BaseModel, Field


class Hotel(BaseModel):
    id: str
    name: str
    city: str
    district: str
    price_per_night: float
    rating: float
    amenities: list[str]
    available: list[list[str]]  # inclusive [check_in, check_out) ranges, ISO dates


class Availability(BaseModel):
    ok: bool
    nights: int
    total: float
    reason: str | None = None


class BookingProposal(BaseModel):
    hotel_id: str
    check_in: str
    check_out: str
    nights: int
    total: float
    why: str


class PlainAnswer(BaseModel):
    text: str


class Reservation(BaseModel):
    id: str  # "res-0001", "res-0002", ...
    hotel_id: str
    guest: str
    check_in: str
    check_out: str
    nights: int
    total: float
    created_at: str  # ISO timestamp of when it was written


class ScreenVerdict(BaseModel):
    verdict: Literal["allow", "block"]
    reason: str = Field(description="One short sentence saying why.")
