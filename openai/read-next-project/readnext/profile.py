"""What one user has told us: the signals they gave, and the taste vector built from them.

A profile is a record of clicks, nothing more — three lists of paper ids. The
taste vector is derived from those lists on demand, so changing how it is
computed never means rebuilding stored state.

Per-user only: no profile ever looks at another user's clicks (ADR-0008).
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Literal

import numpy as np

from .config import PROFILES_DIR

Signal = Literal["like", "dislike", "reading"]

#: The two signals that count as "more like this". They are stored apart so a
#: later book can weigh them differently; today they weigh the same.
POSITIVE_SIGNALS: tuple[Signal, ...] = ("like", "reading")


@dataclass
class Profile:
    """One user's signals, and the taste vector derived from them."""

    user: str
    liked: list[str] = field(default_factory=list)
    disliked: list[str] = field(default_factory=list)
    reading: list[str] = field(default_factory=list)

    def _lists(self) -> dict[str, list[str]]:
        return {"like": self.liked, "dislike": self.disliked, "reading": self.reading}

    def record(self, paper_id: str, signal: Signal) -> None:
        """Record one signal, replacing any earlier signal for the same paper.

        Pressing 👎 on something you had liked moves the paper across rather
        than leaving it in both lists — the latest click is the one that counts.
        """
        for ids in self._lists().values():
            if paper_id in ids:
                ids.remove(paper_id)
        self._lists()[signal].append(paper_id)

    def signal_for(self, paper_id: str) -> Signal | None:
        """The signal currently recorded for this paper, or None if untouched."""
        for signal, ids in self._lists().items():
            if paper_id in ids:
                return signal  # type: ignore[return-value]
        return None

    def positives(self) -> list[str]:
        return self.liked + self.reading

    def taste_vector(
        self, paper_vectors: dict[str, np.ndarray], gamma: float = 0.5
    ) -> np.ndarray | None:
        """The average of what this user wanted, pulled away from what they rejected.

        Positives are averaged into one point; negatives are averaged into
        another, and `gamma` decides how much of that second point is
        subtracted (0 ignores dislikes entirely, 1 gives them the same pull as
        likes). The result is scaled back to length 1, so scores against it are
        cosine similarities on the same 0–1-ish scale as a query's.

        Returns None when nothing positive has been recorded — a cold start has
        no direction to point in, and a caller must fall back to plain search.
        Paper ids with no vector available are skipped.
        """
        positive = _mean_vector(self.positives(), paper_vectors)
        if positive is None:
            return None

        negative = _mean_vector(self.disliked, paper_vectors)
        taste = positive if negative is None else positive - gamma * negative

        norm = float(np.linalg.norm(taste))
        if norm == 0.0:
            return None
        return (taste / norm).astype(np.float32)

    def path(self, dir: Path = PROFILES_DIR) -> Path:
        return dir / f"{self.user}.json"

    def save(self, dir: Path = PROFILES_DIR) -> None:
        dir.mkdir(parents=True, exist_ok=True)
        self.path(dir).write_text(json.dumps(asdict(self), indent=1) + "\n")

    @classmethod
    def load(cls, user: str, dir: Path = PROFILES_DIR) -> Profile:
        """Read a user's profile from disk, or start an empty one if there is none."""
        path = dir / f"{user}.json"
        if not path.exists():
            return cls(user=user)
        return cls(**json.loads(path.read_text()))


def _mean_vector(
    paper_ids: list[str], paper_vectors: dict[str, np.ndarray]
) -> np.ndarray | None:
    """Coordinate-by-coordinate average of the vectors for these papers, or None if none are known."""
    known = [paper_vectors[pid] for pid in paper_ids if pid in paper_vectors]
    if not known:
        return None
    return np.mean(known, axis=0)
