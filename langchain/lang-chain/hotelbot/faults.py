"""Deliberate failures, for watching the agent cope with a tool that breaks.

Nothing here is used by the real tools. A notebook wraps a tool with one of
these functions and hands the wrapped copy to build_agent(tools=...).
"""

import threading

from langchain_core.tools import BaseTool, StructuredTool


def flaky(tool: BaseTool, every: int = 3) -> BaseTool:
    """Return a copy of `tool` that raises RuntimeError on every `every`-th call.

    The copy has the same name, description and arguments, so the model
    can't tell it apart from the original. Calls that don't fail run the
    original tool and return its result unchanged. The count starts at zero
    when flaky() is called and is shared by every agent the copy is given to.
    Calls the model makes in parallel are counted one at a time, so exactly
    one in every `every` calls fails.
    """
    calls = 0
    lock = threading.Lock()

    def run(**kwargs):
        nonlocal calls
        with lock:
            calls += 1
            this_call = calls
        if this_call % every == 0:
            raise RuntimeError(f"{tool.name} is unavailable (call {this_call} failed on purpose)")
        return tool.invoke(kwargs)

    return StructuredTool.from_function(
        func=run,
        name=tool.name,
        description=tool.description,
        args_schema=tool.args_schema,
    )
