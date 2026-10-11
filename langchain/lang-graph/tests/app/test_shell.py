import io

from rich.console import Console

from tripgraph.__main__ import EXAMPLE
from tripgraph.app.render import TripRenderer
from tripgraph.app.shell import run_shell
from tripgraph.graphs.planner import build_planner, plan


class RecordingRenderer:
    def __init__(self):
        self.calls = []

    def welcome(self):
        self.calls.append(("welcome", None))

    def reply(self, result):
        self.calls.append(("reply", result))

    def error(self, exc):
        self.calls.append(("error", exc))

    def notice(self, text):
        self.calls.append(("notice", text))

    def kinds(self):
        return [kind for kind, _ in self.calls]


def scripted(*lines):
    """A read function that returns each line in turn, then acts like Ctrl-D."""
    remaining = list(lines)

    def read():
        if not remaining:
            raise EOFError
        return remaining.pop(0)

    return read


def test_brief_help_quit():
    renderer = RecordingRenderer()
    read = scripted(EXAMPLE.model_dump_json(), "/help", "/quit", "never read")

    run_shell(build_planner(), renderer=renderer, read=read)

    assert renderer.kinds() == ["welcome", "reply", "notice"]
    assert renderer.calls[1][1].state["missing"] == []
    help_text = renderer.calls[2][1]
    assert "/help" in help_text and "/quit" in help_text
    assert "separate run" in help_text


class BrokenGraph:
    def invoke(self, *args, **kwargs):
        raise RuntimeError("node failed")


def test_a_failing_turn_is_reported_and_the_loop_goes_on():
    renderer = RecordingRenderer()

    run_shell(BrokenGraph(), renderer=renderer, read=scripted("anything", "/help"))

    assert renderer.kinds() == ["welcome", "error", "notice"]
    assert str(renderer.calls[1][1]) == "node failed"


def test_ctrl_c_at_the_prompt_ends_the_loop():
    def read():
        raise KeyboardInterrupt

    renderer = RecordingRenderer()
    run_shell(build_planner(), renderer=renderer, read=read)

    assert renderer.kinds() == ["welcome"]


def test_extra_and_unknown_commands():
    seen = []

    def echo(shell, args):
        """Repeat the arguments."""
        seen.append(args)

    renderer = RecordingRenderer()
    run_shell(build_planner(), renderer=renderer, commands={"echo": echo},
              read=scripted("/echo  hello there ", "/nope", "", "/help"))

    assert seen == ["hello there"]
    assert renderer.kinds() == ["welcome", "notice", "notice"]
    assert "/nope" in renderer.calls[1][1]
    assert "/echo" in renderer.calls[2][1]


def test_trip_renderer_shows_the_split_or_the_questions():
    out = io.StringIO()
    renderer = TripRenderer(Console(file=out, width=100))
    graph = build_planner()

    renderer.reply(plan(graph, EXAMPLE.model_dump_json()))
    renderer.reply(plan(graph, "Lisbon next week"))

    text = out.getvalue()
    assert "Lisbon" in text and "2026-10-13" in text and "€900 for 5 nights" in text
    assert "Which cities do you want to visit?" in text
