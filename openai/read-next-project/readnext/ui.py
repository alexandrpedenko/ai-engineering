"""The cards: one paper drawn as a block of HTML, a column of them, and the buttons.

A card is what a paper looks like on screen — title, abstract, a link out to
arXiv. `Deck` adds the three buttons and wires each one to a callback; it
knows nothing about sessions or profiles, only "someone pressed this signal on
this paper id".

Colours are deliberately borrowed from whatever Jupyter theme is running
(a translucent grey border, inherited text colour) so the cards are readable
in both a light and a dark notebook.
"""

from __future__ import annotations

import html

from typing import Callable

import ipywidgets as widgets

from .corpus import Paper
from .profile import Signal

CARD_STYLE = (
    "border: 1px solid rgba(128,128,128,0.4); border-radius: 8px;"
    "padding: 10px 14px; margin: 6px 0; line-height: 1.45;"
)


def card_html(paper: Paper, score: float | None = None) -> str:
    """One paper as a self-contained block of HTML.

    `score` is shown when given — during search it is how well the paper
    matched, and seeing it next to the title is how you tell a strong hit from
    a weak one. Every field is escaped, because abstracts contain `<` and `&`.
    """
    badge = "" if score is None else f'<span style="opacity:0.6"> · {score:.3f}</span>'
    authors = ", ".join(paper.authors[:3])
    if len(paper.authors) > 3:
        authors += " et al."
    return f"""
    <div style="{CARD_STYLE}">
      <div style="font-weight:600; font-size:1.02em;">
        <a href="{html.escape(paper.url)}" target="_blank">{html.escape(paper.title)}</a>{badge}
      </div>
      <div style="opacity:0.7; font-size:0.88em; margin:2px 0 6px;">
        {html.escape(authors)} · {html.escape(paper.published)} · {html.escape(paper.primary_category)}
      </div>
      <div style="font-size:0.92em;">{html.escape(paper.abstract)}</div>
    </div>
    """


def paper_card(paper: Paper, score: float | None = None) -> widgets.HTML:
    """The same block, wrapped as a widget so it can live inside a layout."""
    return widgets.HTML(card_html(paper, score))


def render_papers(papers: list[Paper], scores: list[float] | None = None) -> widgets.VBox:
    """A column of cards, one per paper, in the order given."""
    if scores is None:
        scores = [None] * len(papers)
    return widgets.VBox([paper_card(p, s) for p, s in zip(papers, scores)])


BUTTONS: list[tuple[str, Signal]] = [("👍 like", "like"), ("📖 reading it", "reading"), ("👎 dislike", "dislike")]


class Deck:
    """A fixed number of card slots, built once, refilled on every redraw.

    Every widget here is created before anything is displayed, and a redraw
    only changes their contents. Notebook front ends (VS Code especially) are
    unreliable at drawing widgets that come into existence after their
    container is already on screen, so nothing is created later.
    """

    def __init__(self, n: int, on_feedback: Callable[[str, Signal], None]) -> None:
        self.header = widgets.HTML()
        self.paper_ids: list[str | None] = [None] * n
        self.slots: list[widgets.VBox] = []
        for i in range(n):
            buttons = []
            for label, signal in BUTTONS:
                button = widgets.Button(description=label, layout=widgets.Layout(width="auto"))
                # default args pin this slot's index and signal to this button;
                # the paper id is looked up at click time, since the slot is refilled
                button.on_click(lambda _b, i=i, sig=signal: on_feedback(self.paper_ids[i], sig))
                buttons.append(button)
            self.slots.append(widgets.VBox([widgets.HTML(), widgets.HBox(buttons)]))
        self.box = widgets.VBox([self.header, *self.slots])

    def show(self, recs, header: str = "") -> None:
        """Fill the slots with these recommendations, hiding any slot left over.

        Every slot comes back with its buttons live — a fresh list has no
        judgements on it yet.
        """
        self.set_header(header)
        for i, slot in enumerate(self.slots):
            if i < len(recs):
                rec = recs[i]
                self.paper_ids[i] = rec.paper.id
                slot.children[0].value = card_html(rec.paper, rec.score)
                slot.layout.display = None
                self.mark(i, None)
            else:
                self.paper_ids[i] = None
                slot.layout.display = "none"

    def set_header(self, text: str) -> None:
        self.header.value = f'<div style="opacity:0.7; margin:4px 0;">{html.escape(text)}</div>'

    def mark(self, i: int, signal: Signal | None) -> None:
        """Light the button for the signal slot `i` carries; `None` clears it.

        The other buttons stay live, so a change of mind is one more click.
        The card itself stays where it is — a judgement is acknowledged on the
        spot and acted on at the next question.
        """
        for button, (_label, button_signal) in zip(self.slots[i].children[1].children, BUTTONS):
            button.button_style = "success" if button_signal == signal else ""

    def mark_paper(self, paper_id: str, signal: Signal | None) -> None:
        for i, pid in enumerate(self.paper_ids):
            if pid == paper_id:
                self.mark(i, signal)
