"""A searchable vector index: the `VectorStore` protocol and its first implementation.

`NumpyStore` is brute force — one matrix, `argsort` over a dot product. At
~2,000 vectors that's fast enough that there's no reason to reach for a real
vector database yet. `where` is accepted now so the protocol doesn't change
shape later, but the filter semantics only matter starting notebook 6.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Protocol

import numpy as np

Filter = dict[str, Any]


@dataclass
class Hit:
    chunk_id: str
    paper_id: str
    score: float
    source: Literal["dense", "bm25", "hybrid"]


class VectorStore(Protocol):
    def add(self, ids: list[str], vectors: np.ndarray, meta: list[dict]) -> None: ...

    def search(self, vector: np.ndarray, k: int, where: Filter | None = None) -> list[Hit]: ...


def _matches(meta: dict, where: Filter) -> bool:
    """A row matches if, for every filter key, the meta value equals `want` —
    or, when the meta value is a list (e.g. `categories`), contains it."""
    for key, want in where.items():
        have = meta.get(key)
        if isinstance(have, list):
            if want not in have:
                return False
        elif have != want:
            return False
    return True


class NumpyStore:
    """Brute-force dot-product search over an in-memory matrix.

    Vectors are assumed to already be normalized (as OpenAI's embeddings are),
    so a plain dot product is cosine similarity.
    """

    def __init__(self) -> None:
        self._ids: list[str] = []
        self._meta: list[dict] = []
        self._vectors: np.ndarray | None = None

    def __len__(self) -> int:
        return len(self._ids)

    def add(self, ids: list[str], vectors: np.ndarray, meta: list[dict]) -> None:
        if not (len(ids) == len(vectors) == len(meta)):
            raise ValueError("ids, vectors, and meta must be the same length")
        self._ids.extend(ids)
        self._meta.extend(meta)
        self._vectors = vectors if self._vectors is None else np.vstack([self._vectors, vectors])

    def search(self, vector: np.ndarray, k: int, where: Filter | None = None) -> list[Hit]:
        if self._vectors is None or len(self._ids) == 0:
            return []

        if where is None:
            candidate_idx = np.arange(len(self._ids))
        else:
            candidate_idx = np.array(
                [i for i, m in enumerate(self._meta) if _matches(m, where)], dtype=int
            )
            if candidate_idx.size == 0:
                return []

        scores = self._vectors[candidate_idx] @ vector
        order = np.argsort(-scores)[:k]
        top_idx = candidate_idx[order]
        top_scores = scores[order]
        return [
            Hit(chunk_id=self._ids[i], paper_id=self._meta[i]["paper_id"], score=float(s), source="dense")
            for i, s in zip(top_idx, top_scores)
        ]
