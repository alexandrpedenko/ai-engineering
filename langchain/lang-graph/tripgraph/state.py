"""The planner's state: the one record every node reads from and writes to."""

from typing import Annotated, TypedDict

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages

from tripgraph.domain.models import TripBrief


class PlannerState(TypedDict):
    """Everything the planner knows about the trip so far.

    A node gets the whole state and returns a dict with only the keys it
    changed; the graph merges that dict into the state.

    messages: the conversation. add_messages adds new messages to the end
        of the list instead of replacing the list.
    brief: the trip as read from the last message; None until read_brief runs.
    missing: missing_fields(brief); [] means the brief is complete.
    """

    messages: Annotated[list[AnyMessage], add_messages]
    brief: TripBrief | None
    missing: list[str]
