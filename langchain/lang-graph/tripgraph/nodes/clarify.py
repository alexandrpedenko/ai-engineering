"""Ask the traveller for what the brief is missing."""

from langchain_core.messages import AIMessage

from tripgraph.domain.rules import PROBLEMS
from tripgraph.state import PlannerState


def ask_for_clarification(state: PlannerState) -> dict:
    """Reply with the question for each problem in state["missing"], one per line."""
    questions = [PROBLEMS[problem] for problem in state["missing"]]
    return {"messages": [AIMessage("\n".join(questions))]}
