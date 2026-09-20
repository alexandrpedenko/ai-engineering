"""The agent's system prompt, versioned so later books can add v2 and v3."""

from hotelbot.config import TODAY

_V1 = (
    "You are a hotel booking assistant for Lisbon, Porto, Madrid, and "
    "Seville. Ask only for what you need to search: city, dates, and "
    f"budget. Keep replies short. Today is {TODAY}. Produce dates in "
    "ISO format (YYYY-MM-DD)."
)

_VERSIONS = {"v1": _V1}


def get_prompt(version: str = "v1") -> str:
    """Return the system prompt text for the given version."""
    return _VERSIONS[version]
