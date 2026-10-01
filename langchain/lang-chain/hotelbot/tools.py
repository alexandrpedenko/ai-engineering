"""Tool wrappers around hotelbot/catalogue.py, the policy index, and
hotelbot/reservations.py.

Each docstring here is written for the model, not for a human reader of this
file: it is the only description of the function the model ever sees, so it
states what the function does, what each argument means, what comes back,
and what the function does not do.
"""

from langchain_core.tools import tool

from hotelbot import catalogue, reservations
from hotelbot.index import get_policy_index


@tool
def search_hotels(
    city: str,
    max_price: float | None = None,
    amenities: list[str] | None = None,
    district: str | None = None,
) -> list[dict]:
    """Search the hotel catalogue.

    Args:
        city: City to search in, e.g. "Lisbon", "Porto", "Madrid", "Seville".
        max_price: If given, only return hotels priced at or below this many
            euros per night.
        amenities: If given, only return hotels that have every amenity in
            this list. Valid values: breakfast, wifi, gym, pool, parking,
            spa, pets, ac, elevator.
        district: If given, only return hotels in this district, e.g. "Alfama".

    Returns:
        A list of matching hotels, each a dict with id, name, city, district,
        price_per_night, rating, amenities, and available. This does not
        check whether any specific stay is free — call check_availability
        with a hotel's id for that.
    """
    hotels = catalogue.search_hotels(city, max_price=max_price, amenities=amenities, district=district)
    return [hotel.model_dump() for hotel in hotels]


@tool
def get_hotel(hotel_id: str) -> dict | None:
    """Look up one hotel by its id.

    Args:
        hotel_id: The hotel's id, e.g. "lis-004".

    Returns:
        The hotel as a dict with id, name, city, district, price_per_night,
        rating, amenities, and available, or None if no hotel has that id.
        This does not check availability for any dates.
    """
    hotel = catalogue.get_hotel(hotel_id)
    return hotel.model_dump() if hotel is not None else None


@tool
def check_availability(hotel_id: str, check_in: str, check_out: str) -> dict:
    """Check whether a stay is available at a hotel, and price it.

    Args:
        hotel_id: The hotel's id, e.g. "lis-004".
        check_in: Check-in date, ISO format "YYYY-MM-DD".
        check_out: Check-out date, ISO format "YYYY-MM-DD", after check_in.

    Returns:
        A dict with ok (bool), nights (int), total (float, euros), and
        reason (a string explaining why not, or null when ok is true). ok is
        false for an unknown hotel id, a check_out that is not after
        check_in, or a stay that isn't covered by one continuous available
        range. This never raises — always read ok and reason instead.
    """
    return catalogue.check_availability(hotel_id, check_in, check_out).model_dump()


@tool
def lookup_policy(question: str) -> str:
    """Look up the hotel group's written policies on cancellation, pets,
    payment, accessibility, and check-in.

    Use this for questions about rules, fees, limits, or hours that apply to
    a stay — not for which hotels exist, their amenities, or their prices,
    which search_hotels and get_hotel answer.

    Args:
        question: The policy question in plain words, e.g. "pet fee and
            weight limit" or "when is the balance paid".

    Returns:
        The three passages from the policy documents closest in meaning to
        the question, each starting with "[source: <file name>]" and
        separated by a blank line. The passages may not all be relevant, and
        none may answer the question — say so rather than filling the gap.
    """
    docs = get_policy_index().similarity_search(question, k=3)
    return "\n\n".join(f"[source: {doc.metadata['source']}]\n{doc.page_content}" for doc in docs)


@tool
def make_reservation(hotel_id: str, guest: str, check_in: str, check_out: str) -> dict:
    """Book a stay. Calling this writes a reservation immediately.

    Args:
        hotel_id: The hotel's id, e.g. "lis-004".
        guest: The name the reservation is under.
        check_in: Check-in date, ISO format "YYYY-MM-DD".
        check_out: Check-out date, ISO format "YYYY-MM-DD", after check_in.

    Returns:
        The written reservation as a dict with id, hotel_id, guest, check_in,
        check_out, nights, total, and created_at. If the stay isn't available,
        nothing is written and the dict is {"error": <reason>} instead. This
        never raises.
    """
    try:
        return reservations.add_reservation(hotel_id, guest, check_in, check_out).model_dump()
    except ValueError as error:
        return {"error": str(error)}
