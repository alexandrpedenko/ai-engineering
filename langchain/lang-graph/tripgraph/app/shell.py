"""The terminal loop: read a line, run a command or a planner turn, show the result.

The shell knows nothing about trips. What a reply looks like is the
renderer's job, and extra commands are passed in.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Protocol

from prompt_toolkit import PromptSession

from tripgraph.app.commands import BUILTINS
from tripgraph.graphs.planner import PlannerResult, plan


class Renderer(Protocol):
    def welcome(self) -> None: ...

    def reply(self, result: PlannerResult) -> None: ...

    def error(self, exc: Exception) -> None: ...

    def notice(self, text: str) -> None: ...


@dataclass
class Shell:
    """What a command gets: the graph, the renderer, and a way to stop the loop."""

    graph: object
    renderer: Renderer
    commands: dict[str, Callable[["Shell", str], None]] = field(default_factory=dict)
    make_ctx: Callable[[], object] | None = None
    thread_id: str | None = None
    running: bool = True

    def stop(self) -> None:
        self.running = False


def _prompt_reader() -> Callable[[], str]:
    session = PromptSession()
    return lambda: session.prompt("you › ")


def run_shell(graph, *, renderer, commands=None, make_ctx=None, thread_id=None, read=None) -> None:
    """Run the loop until /quit, Ctrl-D or Ctrl-C.

    A line starting with "/" is a command: "/name args" calls
    commands[name](shell, args). The built-in /help and /quit are always
    there. Any other line is one planner turn, shown with renderer.reply.
    An exception in a turn or a command goes to renderer.error and the loop
    carries on. read returns the next line; by default it's a prompt_toolkit
    prompt, with history on the up arrow. thread_id is passed to every
    turn; None gives each turn a new one.
    """
    shell = Shell(
        graph=graph,
        renderer=renderer,
        commands={**BUILTINS, **(commands or {})},
        make_ctx=make_ctx,
        thread_id=thread_id,
    )
    read = read or _prompt_reader()

    renderer.welcome()
    while shell.running:
        try:
            line = read().strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not line:
            continue
        try:
            if line.startswith("/"):
                name, _, args = line[1:].partition(" ")
                command = shell.commands.get(name)
                if command is None:
                    renderer.notice(f"There's no /{name}. /help lists the commands.")
                else:
                    command(shell, args.strip())
            else:
                ctx = make_ctx() if make_ctx else None
                renderer.reply(plan(graph, line, ctx=ctx, thread_id=shell.thread_id))
        except KeyboardInterrupt:
            break
        except Exception as exc:
            renderer.error(exc)
