"""Commands every app gets. A command is a function (shell, args) -> None.

/help prints each command with the first line of its docstring.
"""


def help_command(shell, args: str) -> None:
    """List the commands."""
    width = max(len(name) for name in shell.commands) + 1
    lines = [
        f"/{name:<{width}} {(command.__doc__ or '').strip().splitlines()[0]}"
        for name, command in shell.commands.items()
    ]
    lines += [
        "",
        "Anything else is sent to the planner as a trip brief.",
        "Each line is a separate run: the planner doesn't remember earlier lines.",
    ]
    shell.renderer.notice("\n".join(lines))


def quit_command(shell, args: str) -> None:
    """Leave (Ctrl-D does the same)."""
    shell.stop()


BUILTINS = {"help": help_command, "quit": quit_command}
