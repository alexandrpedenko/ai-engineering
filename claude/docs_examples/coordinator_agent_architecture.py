from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

from claude.docs_examples.coordinator_prompt import build_coordinator_system_prompt
from claude.docs_examples.coordinator_tools import CoordinatorToolRegistry

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional dependency in this environment
    def load_dotenv() -> None:
        return None

try:
    from anthropic import Anthropic
except ImportError:  # pragma: no cover - optional dependency in this environment
    Anthropic = None  # type: ignore[assignment]

load_dotenv()


class CoordinatorAgentArchitectureDemo:
    """Demonstrate a coordinator-style agent loop for Claude.

    The coordinator first decomposes a request into subtasks, assesses the
    complexity of the work, dispatches the subtasks to specialist spokes, and
    finally aggregates the results into a single decision or plan. This pattern
    is closer to a real multi-agent orchestration setup than a single tool loop.
    """

    def __init__(self, api_key: str | None = None) -> None:
        self.client = None
        self.tool_registry = CoordinatorToolRegistry()
        self.system_prompt = build_coordinator_system_prompt()
        resolved_api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if resolved_api_key:
            if Anthropic is None:
                raise RuntimeError("The anthropic package is not installed. Install it to use live Claude calls.")
            self.client = Anthropic(api_key=resolved_api_key)

    def _build_tools(self) -> list[dict[str, Any]]:
        return self.tool_registry.build_tools()

    def _tool_result(self, tool_name: str, tool_use_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "type": "tool_result",
            "tool_use_id": tool_use_id,
            "content": [
                {
                    "tool_name": tool_name,
                    "status": "ok",
                    "payload": payload,
                }
            ],
        }

    def _run_tool(self, tool_name: str, tool_input: dict[str, Any]) -> dict[str, Any]:
        return self.tool_registry.run_tool(tool_name, tool_input)

    def run_demo(self, user_prompt: str, use_mock: bool | None = None) -> dict[str, Any]:
        if use_mock is None:
            use_mock = self.client is None

        if use_mock:
            return self._run_mock_coordinator_flow(user_prompt)

        if not getattr(self.client, "api_key", None):
            raise RuntimeError("ANTHROPIC_API_KEY is not set")

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        tools = self._build_tools()
        tool_chain: list[str] = []
        spoke_results: dict[str, Any] = {}
        plan: list[dict[str, Any]] = []
        complexity = "unknown"

        for _ in range(5):
            response = self.client.messages.create(
                model="claude-3-5-haiku-latest",
                max_tokens=500,
                temperature=0,
                tools=tools,
                tool_choice={"type": "auto", "disable_parallel_tool_use": True},
                messages=messages,
            )

            tool_blocks = [
                block
                for block in getattr(response, "content", [])
                if getattr(block, "type", None) == "tool_use"
            ]
            if not tool_blocks:
                text_blocks = [
                    getattr(block, "text", "")
                    for block in getattr(response, "content", [])
                    if getattr(block, "type", None) == "text"
                ]
                return {
                    "completed": True,
                    "final_summary": "\n".join(text_blocks),
                    "tool_chain": tool_chain,
                    "plan": plan,
                    "complexity": complexity,
                    "spoke_results": spoke_results,
                    "stop_reason": response.stop_reason,
                }

            for block in tool_blocks:
                tool_name = getattr(block, "name", None)
                if not tool_name:
                    continue
                tool_chain.append(tool_name)
                payload = self._run_tool(tool_name, getattr(block, "input", {}) or {})

                if tool_name == "decompose_task":
                    plan = payload.get("plan", [])
                elif tool_name == "assess_complexity":
                    complexity = payload.get("complexity", "unknown")
                elif tool_name == "get_weather":
                    spoke_results["weather"] = payload
                elif tool_name == "lookup_traffic":
                    spoke_results["traffic"] = payload
                elif tool_name == "check_calendar":
                    spoke_results["calendar"] = payload

                tool_result = self._tool_result(tool_name, getattr(block, "id", "tool-1"), payload)
                messages.append({"role": "assistant", "content": response.content})
                messages.append({"role": "user", "content": [tool_result]})

            if any(getattr(block, "name", None) == "aggregate_results" for block in tool_blocks):
                break

        return {
            "completed": True,
            "final_summary": self._render_summary(user_prompt, plan, complexity, spoke_results),
            "tool_chain": tool_chain,
            "plan": plan,
            "complexity": complexity,
            "spoke_results": spoke_results,
            "stop_reason": "agent_loop_completed",
        }

    def _run_mock_coordinator_flow(self, user_prompt: str) -> dict[str, Any]:
        plan = [
            {"id": "weather", "goal": "Check weather for the destination", "owner": "weather_spoke"},
            {"id": "traffic", "goal": "Check traffic conditions", "owner": "traffic_spoke"},
            {"id": "calendar", "goal": "Check calendar availability", "owner": "calendar_spoke"},
        ]
        complexity = "moderate"
        spoke_results = {
            "weather": {"city": "Seattle", "temperature_c": 18, "condition": "cloudy", "summary": "Mild and mostly cloudy."},
            "traffic": {"city": "Seattle", "travel_time_min": 22, "status": "light", "summary": "Traffic appears light."},
            "calendar": {"date": "2026-07-26", "time": "09:00", "busy": False, "summary": "The requested slot is free."},
        }
        final_summary = self._render_summary(user_prompt, plan, complexity, spoke_results)

        return {
            "completed": True,
            "final_summary": final_summary,
            "tool_chain": ["decompose_task", "assess_complexity", "get_weather", "lookup_traffic", "check_calendar", "aggregate_results"],
            "plan": plan,
            "complexity": complexity,
            "spoke_results": spoke_results,
            "stop_reason": "mock_complete",
        }

    def _render_summary(self, user_prompt: str, plan: list[dict[str, Any]], complexity: str, spoke_results: dict[str, Any]) -> str:
        weather = spoke_results.get("weather", {})
        traffic = spoke_results.get("traffic", {})
        calendar = spoke_results.get("calendar", {})
        return (
            f"Coordinator plan for '{user_prompt}': "
            f"{weather.get('summary', 'Weather checked')} "
            f"{traffic.get('summary', 'Traffic checked')} "
            f"{calendar.get('summary', 'Calendar checked')} "
            f"Complexity: {complexity}; subtasks: {', '.join(item.get('goal', '') for item in plan)}"
        )


if __name__ == "__main__":
    demo = CoordinatorAgentArchitectureDemo()
    result = demo.run_demo(
        user_prompt="Plan my Seattle visit tomorrow. Check the weather, traffic, and my calendar.",
        use_mock=not os.environ.get("ANTHROPIC_API_KEY"),
    )
    print(result)
