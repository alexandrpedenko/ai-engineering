from __future__ import annotations

import unittest

from claude.docs_examples.coordinator_agent_architecture import (
    CoordinatorAgentArchitectureDemo,
)


class CoordinatorAgentArchitectureTests(unittest.TestCase):
    def test_mock_demo_completes_with_coordinator_workflow(self) -> None:
        demo = CoordinatorAgentArchitectureDemo()

        result = demo.run_demo(
            user_prompt="Plan my Seattle visit tomorrow. Check the weather, traffic, and my calendar.",
            use_mock=True,
        )

        self.assertTrue(result["completed"])
        self.assertEqual("moderate", result["complexity"])
        self.assertEqual(3, len(result["plan"]))
        self.assertEqual(
            ["decompose_task", "assess_complexity", "get_weather", "lookup_traffic", "check_calendar", "aggregate_results"],
            result["tool_chain"],
        )
        self.assertIn("Seattle", result["final_summary"])

    def test_live_mode_includes_system_prompt_for_the_coordinator(self) -> None:
        class FakeMessageAPI:
            def __init__(self) -> None:
                self.calls: list[dict[str, object]] = []

            def create(self, **kwargs: object) -> object:
                self.calls.append(kwargs)

                class TextBlock:
                    type = "text"
                    text = "Done"

                class FakeResponse:
                    stop_reason = "end_turn"
                    content = [TextBlock()]

                return FakeResponse()

        class FakeClient:
            def __init__(self) -> None:
                self.api_key = "fake-key"
                self.messages = FakeMessageAPI()

        demo = CoordinatorAgentArchitectureDemo(api_key="fake-key")
        demo.client = FakeClient()

        demo.run_demo("Plan my trip", use_mock=False)

        first_call = demo.client.messages.calls[0]
        self.assertEqual("system", first_call["messages"][0]["role"])
        self.assertIn("You are the coordinator", first_call["messages"][0]["content"])


if __name__ == "__main__":
    unittest.main()
