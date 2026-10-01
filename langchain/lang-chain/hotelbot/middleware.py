"""Middleware written for hotelbot. Each class hooks into the agent loop at
one of the points AgentMiddleware defines."""

from langchain.agents.middleware import AgentMiddleware


class LogToolCalls(AgentMiddleware):
    """Print every tool call the agent makes: the tool's name and arguments
    before it runs, and how many characters it returned after.

    It only prints; it never changes a call or its result.
    """

    def wrap_tool_call(self, request, handler):
        call = request.tool_call
        print(f"-> {call['name']} {call['args']}")
        result = handler(request)
        print(f"<- {call['name']} returned {len(str(getattr(result, 'content', '')))} characters")
        return result
