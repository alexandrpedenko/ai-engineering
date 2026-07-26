from __future__ import annotations

from types import SimpleNamespace
import unittest

from claude.docs_examples.end_loop import run_end_turn_loop
from claude.docs_examples.stop_reason import describe_stop_reason


class DescribeStopReasonTests(unittest.TestCase):
    def test_tool_use_reason_mentions_the_tool_name(self) -> None:
        message = SimpleNamespace(
            stop_reason="tool_use",
            content=[
                SimpleNamespace(
                    type="tool_use",
                    name="get_weather",
                    input={"city": "Paris"},
                )
            ],
        )

        description = describe_stop_reason(message)

        self.assertIn("tool call", description.lower())
        self.assertIn("get_weather", description)


class EndLoopTests(unittest.TestCase):
    def test_run_end_turn_loop_stops_when_the_model_finishes(self) -> None:
        responses = iter(
            [
                SimpleNamespace(
                    stop_reason="tool_use",
                    content=[SimpleNamespace(type="tool_use", id="toolu_1", name="lookup", input={})],
                ),
                SimpleNamespace(
                    stop_reason="end_turn",
                    content=[SimpleNamespace(type="text", text="Done.")],
                ),
            ]
        )

        result = run_end_turn_loop(lambda messages: next(responses), "Hello")

        self.assertTrue(result["completed"])
        self.assertEqual("Done.", result["final_text"])
        self.assertEqual(2, result["iterations"])


if __name__ == "__main__":
    unittest.main()
