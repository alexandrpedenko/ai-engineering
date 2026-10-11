"""The planner graph, and a function that runs one turn of it."""

import uuid
from dataclasses import dataclass

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from tripgraph.nodes import (
    ask_for_clarification,
    confirm_brief,
    read_brief,
    route_after_validate,
    validate_brief,
)
from tripgraph.state import PlannerState


def build_planner(checkpointer=None) -> CompiledStateGraph:
    """Build the planner graph.

    START -> read_brief -> validate_brief, then route_after_validate picks
    ask_for_clarification or confirm_brief, and either one goes to END.
    checkpointer is passed to compile(); with None, every run starts from
    the input alone and nothing is kept between runs.
    """
    builder = StateGraph(PlannerState)
    builder.add_node("read_brief", read_brief)
    builder.add_node("validate_brief", validate_brief)
    builder.add_node("ask_for_clarification", ask_for_clarification)
    builder.add_node("confirm_brief", confirm_brief)
    builder.add_edge(START, "read_brief")
    builder.add_edge("read_brief", "validate_brief")
    builder.add_conditional_edges("validate_brief", route_after_validate)
    builder.add_edge("ask_for_clarification", END)
    builder.add_edge("confirm_brief", END)
    return builder.compile(checkpointer=checkpointer)


@dataclass
class PlannerResult:
    """What one turn produced."""

    state: dict  # the graph's state at the end of the run
    reply: str  # text of the last AIMessage, "" if there is none
    thread_id: str
    interrupt: dict | None = None  # always None: nothing pauses a run yet


def plan(graph, text: str, ctx=None, thread_id: str | None = None) -> PlannerResult:
    """Run one turn: text goes in as a HumanMessage, the final state comes out.

    ctx is accepted and ignored. thread_id is passed in the run's config;
    a new one is made when it's None. Without a checkpointer it changes
    nothing about the run.
    """
    thread_id = thread_id or str(uuid.uuid4())
    state = graph.invoke(
        {"messages": [HumanMessage(text)]},
        config={"configurable": {"thread_id": thread_id}},
    )
    replies = [m for m in state["messages"] if isinstance(m, AIMessage)]
    return PlannerResult(
        state=dict(state),
        reply=replies[-1].text if replies else "",
        thread_id=thread_id,
    )
