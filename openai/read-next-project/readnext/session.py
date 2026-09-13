"""One sitting with the app: the state the pure ranker refuses to hold.

A `Session` owns the profile, the seen-set, the turn counter, and — once the
cards are clickable — the widget it draws into. `ask()` runs the two ranking
stages, logs the event, and remembers what was shown; `feedback()` records a
click on the profile and on the log; the next `ask()` is where it shows.
"""

from __future__ import annotations

import uuid
from dataclasses import asdict, dataclass, field

import ipywidgets as widgets
import numpy as np

from . import events, ui
from .config import PipelineConfig
from .embed import embed_texts
from .profile import Profile, Signal
from .recommend import Recommendation, rerank, retrieve
from .search import Index


def _new_session_id() -> str:
    return "s" + uuid.uuid4().hex[:6]


@dataclass
class Session:
    index: Index
    profile: Profile
    config: PipelineConfig = field(default_factory=PipelineConfig)
    id: str = field(default_factory=_new_session_id)
    turn: int = 0
    seen: set[str] = field(default_factory=set)
    signals: dict[str, Signal] = field(default_factory=dict)
    shown_on: dict[str, int] = field(default_factory=dict, repr=False)   # paper id -> turn it appeared

    # what the current turn is showing, kept so a click can re-rank it
    query: str = ""
    query_vector: np.ndarray | None = field(default=None, repr=False)
    candidates: list[str] = field(default_factory=list, repr=False)
    shown: list[Recommendation] = field(default_factory=list, repr=False)

    # the one output area this session draws into; a redraw refills its cards
    view: widgets.VBox = field(default_factory=widgets.VBox, repr=False)
    log: widgets.Output = field(default_factory=widgets.Output, repr=False)
    prompt: widgets.Text = field(default_factory=lambda: widgets.Text(
        placeholder="what do you want to read about? press Enter", layout=widgets.Layout(width="60%")
    ), repr=False)

    def __post_init__(self) -> None:
        # Enter in the box asks a new question — same callback idea as a button
        self.prompt.on_submit(self._on_submit)
        self.deck = ui.Deck(self.config.final_k, self._on_click)
        self.view.children = (self.prompt, self.log, self.deck.box)

    def ask(self, text: str) -> list[Recommendation]:
        """Search, log the event, remember what was shown."""
        self.turn += 1
        self.query = text
        self.query_vector = embed_texts([text])[0]
        self.candidates = retrieve(self.index, self.query_vector, self.config, frozenset(self.seen))
        self.shown = rerank(self.index, self.candidates, self.query_vector, self.profile, self.config)
        self._remember_shown()
        events.append(events.Event(
            session=self.id,
            turn=self.turn,
            user=self.profile.user,
            query=text,
            resolved_query={},
            config=asdict(self.config),
            candidates=list(self.candidates),
            shown=[rec.paper.id for rec in self.shown],
        ))
        self._draw()
        return self.shown

    def feedback(self, paper_id: str, signal: Signal) -> None:
        """Record one click. The list on screen does not change.

        The signal goes onto the profile (saved to disk), into this session,
        and onto the log row of the turn that showed the paper. The card is
        marked so the click is visibly acknowledged, but nothing is re-ranked:
        the taste vector is read once per turn, by `ask()`, so what you pressed
        here shapes the *next* list, not this one. That keeps a turn atomic —
        one query, one list, any number of signals against that same list —
        which is what book 5's metrics assume (ADR-0013).
        """
        self.profile.record(paper_id, signal)
        self.profile.save()
        self.signals[paper_id] = signal
        events.update_signals(self.id, self.shown_on.get(paper_id, self.turn), paper_id, signal)
        self.deck.mark_paper(paper_id, signal)
        self._draw_header()

    def _draw(self) -> None:
        """Refill the cards for a new turn, in the same output area."""
        self.deck.show(self.shown, self._header())

    def _draw_header(self) -> None:
        self.deck.set_header(self._header())

    def _header(self) -> str:
        return f"turn {self.turn} · {self.query!r} · {len(self.signals)} signals this session"

    def _on_submit(self, box: widgets.Text) -> None:
        text = box.value.strip()
        if not text:
            return
        box.value = ""
        with self.log:
            self.ask(text)

    def _on_click(self, paper_id: str, signal: Signal) -> None:
        # a button handler that raises would fail silently; inside `log` the
        # traceback is drawn on screen instead
        with self.log:
            self.feedback(paper_id, signal)

    def _remember_shown(self) -> None:
        for rec in self.shown:
            self.seen.add(rec.paper.id)
            self.shown_on.setdefault(rec.paper.id, self.turn)
