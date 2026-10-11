"""How the trip planner's replies look in the terminal."""

from datetime import date

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from tripgraph.domain.rules import nights, split_nights
from tripgraph.graphs.planner import PlannerResult


class TripRenderer:
    """A table of the night split when the brief is complete; otherwise the reply in a panel."""

    def __init__(self, console: Console | None = None):
        self.console = console or Console()

    def welcome(self) -> None:
        self.console.print(
            Panel(
                Text(
                    "Type a trip brief as JSON. /example prints one to copy.\n"
                    "/help lists the commands; Ctrl-D leaves."
                ),
                title="tripgraph",
                expand=False,
            )
        )

    def reply(self, result: PlannerResult) -> None:
        brief = result.state.get("brief")
        if brief is None or result.state.get("missing"):
            self.console.print(Panel(Text(result.reply), title="I need a bit more", expand=False))
            return

        table = Table(title="Your trip", caption=_summary(brief))
        table.add_column("City")
        table.add_column("Check-in")
        table.add_column("Check-out")
        table.add_column("Nights", justify="right")
        for city, check_in, check_out in split_nights(brief):
            table.add_row(city, check_in, check_out, str(_days(check_in, check_out)))
        self.console.print(table)

    def error(self, exc: Exception) -> None:
        self.console.print(Text(f"Error: {type(exc).__name__}: {exc}", style="red"))

    def notice(self, text: str) -> None:
        # soft_wrap: long lines aren't broken, so JSON can be copied in one piece.
        self.console.print(Text(text), soft_wrap=True)


def _days(check_in: str, check_out: str) -> int:
    return (date.fromisoformat(check_out) - date.fromisoformat(check_in)).days


def _summary(brief) -> str:
    people = "traveller" if brief.travellers == 1 else "travellers"
    return f"€{brief.budget:,.0f} for {nights(brief)} nights, {brief.travellers} {people}"
