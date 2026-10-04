"""The agent loop, built once here and reused by every later book."""

import uuid
from dataclasses import dataclass

from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware
from langchain.agents.structured_output import ToolStrategy
from langchain.chat_models import init_chat_model
from langchain_core.messages import BaseMessage, HumanMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
from langgraph.types import Command

from hotelbot.config import CHAT_MODEL
from hotelbot.models import BookingProposal, PlainAnswer
from hotelbot.prompts import get_prompt
from hotelbot.tools import (
    check_availability,
    get_hotel,
    lookup_policy,
    make_reservation,
    search_hotels,
)


@dataclass
class AgentResult:
    messages: list[BaseMessage]
    structured_response: BookingProposal | PlainAnswer | None
    thread_id: str
    interrupt: dict | None = None  # set when the run paused for approval


TOOLS = [search_hotels, get_hotel, check_availability, lookup_policy, make_reservation]


def build_agent(prompt_version="v1", middleware=(), checkpointer=None, tools=None, model=None):
    """Build the hotelbot agent: the catalogue tools, the policy lookup,
    make_reservation, a versioned system prompt, and a typed final answer.

    Every agent built here pauses before make_reservation runs and waits for
    a decision passed to resume(). That gate is added first, whatever is in
    `middleware`, so no caller can build an agent that books on its own.

    `checkpointer` stores each conversation's messages under its thread id,
    so a later call on the same thread sees the earlier turns. It defaults to
    an in-memory one, which forgets everything when the process stops.
    `middleware` is a list of extra middleware, added after the gate.
    `tools` replaces the tool list; it defaults to TOOLS. The gate applies
    to whichever tool in it is named make_reservation.
    `model` is a model id string or a chat model; it defaults to CHAT_MODEL
    with low reasoning effort.
    """
    if checkpointer is None:
        # The saved state includes the typed answer, so the serializer has to
        # be told our answer classes are safe to load back.
        checkpointer = InMemorySaver(
            serde=JsonPlusSerializer(
                allowed_msgpack_modules=[
                    ("hotelbot.models", "BookingProposal"),
                    ("hotelbot.models", "PlainAnswer"),
                ]
            )
        )
    if model is None:
        model = init_chat_model(CHAT_MODEL, reasoning_effort="low")
    return create_agent(
        model,
        tools=TOOLS if tools is None else tools,
        system_prompt=get_prompt(prompt_version),
        response_format=ToolStrategy(BookingProposal | PlainAnswer),
        middleware=[HumanInTheLoopMiddleware(interrupt_on={"make_reservation": True}), *middleware],
        checkpointer=checkpointer,
    )


def run(agent, text: str, thread_id: str | None = None, config: dict | None = None) -> AgentResult:
    """Run one turn and unpack the resulting state.

    With no `thread_id`, the turn gets a new thread and sees no earlier
    messages. Pass the same `thread_id` to several calls to continue one
    conversation.

    `config` is passed on to the run alongside the thread id: `tags`,
    `metadata` and `run_id` there end up on the run's trace in LangSmith.
    """
    if thread_id is None:
        thread_id = str(uuid.uuid4())
    result = agent.invoke(
        {"messages": [HumanMessage(text)]},
        config=_with_thread(config, thread_id),
    )
    return _unpack(result, thread_id)


def resume(agent, decision: dict, thread_id: str, config: dict | None = None) -> AgentResult:
    """Continue a run that paused for approval, with your decision on it.

    `decision` is one of:
        {"type": "approve"}
        {"type": "edit", "edited_action": {"name": "make_reservation", "args": {...}}}
        {"type": "reject", "message": "why, in words the model will read"}
    It applies to the one paused booking; a run that paused on several
    bookings at once is not handled here. `config` works as in run().
    """
    result = agent.invoke(
        Command(resume={"decisions": [decision]}),
        config=_with_thread(config, thread_id),
    )
    return _unpack(result, thread_id)


def _with_thread(config: dict | None, thread_id: str) -> dict:
    return {**(config or {}), "configurable": {"thread_id": thread_id}}


def _unpack(result: dict, thread_id: str) -> AgentResult:
    paused = result.get("__interrupt__")
    return AgentResult(
        messages=result["messages"],
        structured_response=result.get("structured_response"),
        thread_id=thread_id,
        interrupt=paused[0].value if paused else None,
    )
