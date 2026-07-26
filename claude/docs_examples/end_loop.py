from __future__ import annotations

from typing import Any, Callable


def run_end_turn_loop(
    create_response: Callable[[list[dict[str, Any]]], Any],
    user_prompt: str,
    max_iterations: int = 5,
) -> dict[str, Any]:
    """Demonstrate the docs' recommended loop handling for stop_reason='end_turn'.

    The loop keeps going only while Claude needs more input (for example after a
    tool use). When Claude returns an ``end_turn`` response, the assistant turn is
    complete and the loop exits instead of asking the same model again.
    """

    messages: list[dict[str, Any]] = [{"role": "user", "content": user_prompt}]
    iterations = 0

    while iterations < max_iterations:
        iterations += 1
        response = create_response(messages)

        if getattr(response, "stop_reason", None) == "tool_use":
            tool_results = [
                {
                    "type": "tool_result",
                    "tool_use_id": getattr(block, "id", None) or block.get("id"),
                    "content": "Tool result placeholder",
                }
                for block in getattr(response, "content", None) or []
                if getattr(block, "type", None) == "tool_use" or block.get("type") == "tool_use"
            ]
            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})
            continue

        if getattr(response, "stop_reason", None) == "end_turn":
            text_blocks = [
                getattr(block, "text", None)
                for block in getattr(response, "content", None) or []
                if getattr(block, "type", None) == "text"
            ]
            return {
                "completed": True,
                "iterations": iterations,
                "stop_reason": response.stop_reason,
                "final_text": "".join(text_blocks),
            }

        return {
            "completed": False,
            "iterations": iterations,
            "stop_reason": getattr(response, "stop_reason", None),
            "final_text": "",
        }

    return {
        "completed": False,
        "iterations": iterations,
        "stop_reason": "max_iterations",
        "final_text": "",
    }


if __name__ == "__main__":
    print(
        "This example shows how to stop a loop when Claude returns stop_reason='end_turn'."
    )
