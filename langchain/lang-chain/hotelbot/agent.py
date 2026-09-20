"""The agent loop, built once here and reused by every later book."""

from dataclasses import dataclass

from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy
from langchain.chat_models import init_chat_model
from langchain_core.messages import BaseMessage, HumanMessage

from hotelbot.config import CHAT_MODEL
from hotelbot.models import BookingProposal, PlainAnswer
from hotelbot.prompts import get_prompt
from hotelbot.tools import check_availability, get_hotel, search_hotels


@dataclass
class AgentResult:
    messages: list[BaseMessage]
    structured_response: BookingProposal | PlainAnswer | None


def build_agent(prompt_version="v1", middleware=(), checkpointer=None):
    """Build the hotelbot agent: the catalogue tools, a versioned system
    prompt, and a typed final answer.

    `middleware` and `checkpointer` are accepted so later books can pass
    them without changing this signature; neither is used yet.
    """
    model = init_chat_model(CHAT_MODEL, reasoning_effort="low")
    return create_agent(
        model,
        tools=[search_hotels, get_hotel, check_availability],
        system_prompt=get_prompt(prompt_version),
        response_format=ToolStrategy(BookingProposal | PlainAnswer),
    )


def run(agent, text: str, thread_id: str = "default") -> AgentResult:
    """Run one turn and unpack the resulting state."""
    result = agent.invoke(
        {"messages": [HumanMessage(text)]},
        config={"configurable": {"thread_id": thread_id}},
    )
    return AgentResult(
        messages=result["messages"],
        structured_response=result.get("structured_response"),
    )
