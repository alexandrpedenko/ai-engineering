"""Pure functions over data/hotels.json. No model call ever happens here."""

import json
from datetime import date

from hotelbot.config import DATA_DIR
from hotelbot.models import Availability, Hotel

HOTELS_FILE = DATA_DIR / "hotels.json"


def load_hotels() -> list[Hotel]:
    records = json.loads(HOTELS_FILE.read_text())
    return [Hotel(**record) for record in records]


def search_hotels(
    city: str,
    max_price: float | None = None,
    amenities: list[str] | None = None,
    district: str | None = None,
) -> list[Hotel]:
    results = [h for h in load_hotels() if h.city.lower() == city.lower()]
    if max_price is not None:
        results = [h for h in results if h.price_per_night <= max_price]
    if district is not None:
        results = [h for h in results if h.district.lower() == district.lower()]
    if amenities is not None:
        results = [h for h in results if set(amenities) <= set(h.amenities)]
    return results


def get_hotel(hotel_id: str) -> Hotel | None:
    for hotel in load_hotels():
        if hotel.id == hotel_id:
            return hotel
    return None


def check_availability(hotel_id: str, check_in: str, check_out: str) -> Availability:
    hotel = get_hotel(hotel_id)
    if hotel is None:
        return Availability(ok=False, nights=0, total=0.0, reason=f"no hotel with id '{hotel_id}'")

    if check_out <= check_in:
        return Availability(ok=False, nights=0, total=0.0, reason="check_out must be after check_in")

    nights = (date.fromisoformat(check_out) - date.fromisoformat(check_in)).days
    total = round(nights * hotel.price_per_night, 2)

    for start, end in hotel.available:
        if start <= check_in and check_out <= end:
            return Availability(ok=True, nights=nights, total=total, reason=None)

    return Availability(ok=False, nights=nights, total=total, reason="no availability window covers these dates")
