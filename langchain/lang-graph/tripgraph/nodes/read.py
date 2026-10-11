"""Turn the traveller's last message into a TripBrief."""

from langchain_core.messages import HumanMessage
from pydantic import ValidationError

from tripgraph.domain.models import TripBrief
from tripgraph.state import PlannerState


def read_brief(state: PlannerState) -> dict:
    """Read the last human message as a TripBrief written in JSON.

    Returns {"brief": TripBrief}. Text that isn't JSON, or JSON that doesn't
    fit TripBrief (a budget of "lots", a list instead of an object), gives
    an empty TripBrief, so every required field shows up as missing. It
    reads JSON only: "Lisbon next week" is not understood.
    """
    humans = [m for m in state["messages"] if isinstance(m, HumanMessage)]
    text = humans[-1].text if humans else ""
    try:
        brief = TripBrief.model_validate_json(text)
    except ValidationError:
        brief = TripBrief()
    return {"brief": brief}
