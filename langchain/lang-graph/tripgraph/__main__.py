"""python -m tripgraph: the planner in the terminal."""

from tripgraph.app.render import TripRenderer
from tripgraph.app.shell import run_shell
from tripgraph.domain.models import TripBrief
from tripgraph.graphs.planner import build_planner

EXAMPLE = TripBrief(
    cities=["Lisbon", "Porto"],
    start="2026-10-10",
    end="2026-10-15",
    budget=900,
    interests=["food", "museums"],
)


def example_command(shell, args: str) -> None:
    """Print a sample brief as JSON, to copy and paste back."""
    shell.renderer.notice(EXAMPLE.model_dump_json(exclude_defaults=True))


def main() -> None:
    run_shell(build_planner(), renderer=TripRenderer(), commands={"example": example_command})


if __name__ == "__main__":
    main()
