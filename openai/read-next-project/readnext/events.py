"""The interaction log: one row per search, with the clicks it drew.

`data/events.jsonl` is append-only and committed — it is the test set
(ADR-0005). A row is written the moment a search is shown, with `signals`
empty; each click then rewrites that row's `signals` in place. A click on turn
1 after turn 2 has been asked still lands on turn 1's row, because the row is
found by (session, turn), not by "the latest".
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from .config import EVENTS_FILE
from .profile import Signal


@dataclass
class Event:
    session: str
    turn: int
    user: str
    query: str
    resolved_query: dict            # {} until book 6
    config: dict                    # asdict(PipelineConfig) that produced it
    candidates: list[str]           # the whole stage-1 pool — what replay re-ranks
    shown: list[str]                # the final_k that reached the screen, in order
    signals: dict[str, Signal] = field(default_factory=dict)
    ts: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat(timespec="seconds"))


def append(event: Event, path: Path = EVENTS_FILE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as f:
        f.write(json.dumps(asdict(event)) + "\n")


def load(path: Path = EVENTS_FILE) -> list[Event]:
    if not path.exists():
        return []
    with path.open() as f:
        return [Event(**json.loads(line)) for line in f if line.strip()]


def update_signals(session: str, turn: int, paper_id: str, signal: Signal, path: Path = EVENTS_FILE) -> None:
    """Record one click on the row it belongs to, rewriting the file.

    The file is small enough (one line per search) that rewriting it whole is
    simpler than anything cleverer. Raises if no such row exists — a click on
    a turn that was never logged is a bug, not something to paper over.
    """
    events = load(path)
    for event in events:
        if event.session == session and event.turn == turn:
            event.signals[paper_id] = signal
            break
    else:
        raise KeyError(f"no event for session={session!r} turn={turn}")
    with path.open("w") as f:
        for event in events:
            f.write(json.dumps(asdict(event)) + "\n")
