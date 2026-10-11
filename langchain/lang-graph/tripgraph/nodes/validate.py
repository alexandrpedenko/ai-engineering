"""Say what a brief is still missing, and where the graph goes next."""

from typing import Literal

from tripgraph.domain.rules import missing_fields
from tripgraph.state import PlannerState


def validate_brief(state: PlannerState) -> dict:
    """Return {"missing": missing_fields(brief)}. Reads only state["brief"]."""
    return {"missing": missing_fields(state["brief"])}


def route_after_validate(state: PlannerState) -> Literal["ask_for_clarification", "confirm_brief"]:
    """Name the node to run after validate_brief.

    Anything in state["missing"] sends the run to ask_for_clarification;
    an empty list sends it to confirm_brief. Reads only state["missing"].
    """
    return "ask_for_clarification" if state["missing"] else "confirm_brief"
