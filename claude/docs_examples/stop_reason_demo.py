from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
from anthropic import Anthropic

from claude.docs_examples.stop_reason import describe_stop_reason

load_dotenv()


class StopReasonDemo:
    def __init__(self, api_key: str | None = None) -> None:
        self.client = Anthropic(api_key=api_key or os.environ.get("ANTHROPIC_API_KEY"))

    def run(self, model: str = "claude-3-5-haiku-latest") -> dict[str, Any]:
        if not self.client.api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not set")

        plain_message = self.client.messages.create(
            model=model,
            max_tokens=80,
            temperature=0,
            messages=[
                {
                    "role": "user",
                    "content": "Explain Claude stop reasons in one short sentence.",
                }
            ],
        )

        tool_message = self.client.messages.create(
            model=model,
            max_tokens=120,
            temperature=0,
            tools=[
                {
                    "name": "get_weather",
                    "description": "Get the current weather for a city.",
                    "input_schema": {
                        "type": "object",
                        "properties": {
                            "city": {"type": "string"},
                        },
                        "required": ["city"],
                    },
                }
            ],
            messages=[
                {
                    "role": "user",
                    "content": "Use the weather tool to tell me the weather in Paris.",
                }
            ],
        )

        return {
            "plain_example": {
                "stop_reason": plain_message.stop_reason,
                "stop_sequence": getattr(plain_message, "stop_sequence", None),
                "description": describe_stop_reason(plain_message),
                "text": plain_message.content[0].text,
            },
            "tool_example": {
                "stop_reason": tool_message.stop_reason,
                "stop_sequence": getattr(tool_message, "stop_sequence", None),
                "description": describe_stop_reason(tool_message),
                "content": [getattr(block, "model_dump", lambda: block)() for block in tool_message.content],
            },
        }


if __name__ == "__main__":
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY is not set. Set it in your environment or .env file to run the live demo.")
    else:
        demo = StopReasonDemo()
        result = demo.run()
        print(result)
