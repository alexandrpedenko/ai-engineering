"""Reads and writes data/reservations.json — the only code that writes it.

The file is not committed; a missing file means no reservations yet.
"""

import json
from datetime import datetime

from hotelbot import catalogue
from hotelbot.config import DATA_DIR
from hotelbot.models import Reservation

RESERVATIONS_FILE = DATA_DIR / "reservations.json"


def load_reservations() -> list[Reservation]:
    if not RESERVATIONS_FILE.exists():
        return []
    records = json.loads(RESERVATIONS_FILE.read_text())
    return [Reservation(**record) for record in records]


def _save(reservations: list[Reservation]) -> None:
    RESERVATIONS_FILE.write_text(json.dumps([r.model_dump() for r in reservations], indent=2) + "\n")


def add_reservation(hotel_id: str, guest: str, check_in: str, check_out: str) -> Reservation:
    """Write one reservation and return it.

    Checks the stay against the catalogue's availability first and raises
    ValueError with the reason if it isn't available. Does not check whether
    an earlier reservation already covers the same dates — the catalogue
    doesn't track how many rooms a hotel has.
    """
    availability = catalogue.check_availability(hotel_id, check_in, check_out)
    if not availability.ok:
        raise ValueError(availability.reason)

    reservations = load_reservations()
    reservation = Reservation(
        id=f"res-{len(reservations) + 1:04d}",
        hotel_id=hotel_id,
        guest=guest,
        check_in=check_in,
        check_out=check_out,
        nights=availability.nights,
        total=availability.total,
        created_at=datetime.now().isoformat(timespec="seconds"),
    )
    _save(reservations + [reservation])
    return reservation


def reset_reservations() -> None:
    """Empty the reservations file."""
    _save([])
