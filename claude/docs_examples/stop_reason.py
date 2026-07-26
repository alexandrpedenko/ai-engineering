from __future__ import annotations

from typing import Any


def describe_stop_reason(message: Any) -> str:
    """Return a human-readable explanation for an Anthropic stop reason."""
    reason = getattr(message, "stop_reason", None)

    if reason is None:
        return "No stop reason provided."
    if reason == "end_turn":
        return "The assistant finished the turn normally."
    if reason == "max_tokens":
        return "The response reached the maximum token limit."
    if reason == "tool_use":
        tool_name = None
        content = getattr(message, "content", None) or []
        if content:
            first_block = content[0]
            tool_name = getattr(first_block, "name", None)
            if tool_name is None and isinstance(first_block, dict):
                tool_name = first_block.get("name")
        if tool_name:
            return f"The assistant requested a tool call to {tool_name!r}."
        return "The assistant requested a tool call."
    if reason == "stop_sequence":
        stop_sequence = getattr(message, "stop_sequence", None)
        return f"The response matched a stop sequence: {stop_sequence!r}"
    if reason == "pause_turn":
        return "The conversation turn was paused."

    return f"Unhandled stop reason: {reason!r}"
