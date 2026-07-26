from __future__ import annotations

from typing import Any


class CoordinatorToolRegistry:
    """Centralize tool definitions and execution logic for the coordinator demo."""

    def build_tools(self) -> list[dict[str, Any]]:
        return [
            {
                "name": "decompose_task",
                "description": "Break a high-level request into concrete coordinator subtasks and assign a specialist role to each.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "user_prompt": {"type": "string", "description": "The user's request."},
                    },
                    "required": ["user_prompt"],
                },
            },
            {
                "name": "assess_complexity",
                "description": "Assess whether the plan is simple, moderate, or complex and decide what execution strategy to use.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "task_summary": {"type": "string", "description": "A short summary of the plan."},
                        "subtasks": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "The list of subtasks identified by the coordinator.",
                        },
                    },
                    "required": ["task_summary", "subtasks"],
                },
            },
            {
                "name": "get_weather",
                "description": "Inspect weather conditions for a city that informs the plan.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "city": {"type": "string", "description": "City name such as Seattle or Paris."},
                        "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]},
                    },
                    "required": ["city"],
                },
            },
            {
                "name": "lookup_traffic",
                "description": "Inspect traffic conditions for the target city or route.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "city": {"type": "string", "description": "City to inspect."},
                        "route": {"type": "string", "description": "Optional route or corridor."},
                    },
                    "required": ["city"],
                },
            },
            {
                "name": "check_calendar",
                "description": "Check whether the user has existing commitments at a requested time.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "date": {"type": "string", "description": "Date in YYYY-MM-DD format."},
                        "time": {"type": "string", "description": "Time in HH:MM format."},
                    },
                    "required": ["date", "time"],
                },
            },
            {
                "name": "aggregate_results",
                "description": "Aggregate the coordinator's intermediate findings into a final recommendation.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "user_prompt": {"type": "string", "description": "Original user request."},
                        "plan": {
                            "type": "array",
                            "items": {"type": "object"},
                            "description": "The subtasks selected by the coordinator.",
                        },
                        "complexity": {"type": "string", "description": "Complexity level determined by the coordinator."},
                        "spoke_results": {"type": "object", "description": "Findings from the specialist tools."},
                    },
                    "required": ["user_prompt", "plan", "complexity", "spoke_results"],
                },
            },
        ]

    def run_tool(self, tool_name: str, tool_input: dict[str, Any]) -> dict[str, Any]:
        if tool_name == "decompose_task":
            return {
                "plan": [
                    {"id": "weather", "goal": "Check weather for the destination", "owner": "weather_spoke"},
                    {"id": "traffic", "goal": "Check traffic conditions", "owner": "traffic_spoke"},
                    {"id": "calendar", "goal": "Check calendar availability", "owner": "calendar_spoke"},
                ],
                "reason": "The request needs several independent data sources before a plan can be recommended.",
            }

        if tool_name == "assess_complexity":
            subtasks = tool_input.get("subtasks") or []
            complexity = "moderate" if len(subtasks) >= 3 else "simple"
            return {
                "complexity": complexity,
                "execution_strategy": "run_spokes_in_parallel",
                "max_rounds": 3,
            }

        if tool_name == "get_weather":
            return {
                "city": tool_input.get("city", "Seattle"),
                "temperature_c": 18,
                "condition": "cloudy",
                "summary": "Mild and mostly cloudy.",
            }

        if tool_name == "lookup_traffic":
            return {
                "city": tool_input.get("city", "Seattle"),
                "travel_time_min": 22,
                "status": "light",
                "summary": "Traffic appears light.",
            }

        if tool_name == "check_calendar":
            return {
                "date": tool_input.get("date", "2026-07-26"),
                "time": tool_input.get("time", "09:00"),
                "busy": False,
                "summary": "The requested slot is free.",
            }

        if tool_name == "aggregate_results":
            plan = tool_input.get("plan") or []
            spoke_results = tool_input.get("spoke_results") or {}
            user_prompt = tool_input.get("user_prompt", "")
            summary = (
                f"Coordinator plan for '{user_prompt}': "
                f"{spoke_results.get('weather', {}).get('summary', 'Weather checked')} "
                f"{spoke_results.get('traffic', {}).get('summary', 'Traffic checked')} "
                f"{spoke_results.get('calendar', {}).get('summary', 'Calendar checked')}"
            )
            return {
                "summary": summary,
                "confidence": "high",
                "handoff": "ready_for_user",
                "planned_subtasks": [item.get("goal", "") for item in plan],
            }

        return {"status": "error", "error": f"Unknown tool: {tool_name}"}
