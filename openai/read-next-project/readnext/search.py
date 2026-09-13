"""Turn a query into results: build a dense index from chunks, then search it.

Notebook 3 is dense-only — one retriever, one store. Later notebooks extend
this file with lexical search, fusion, filters, and diversity, but the shape
started here (embed the query, search the store, collapse chunks to papers)
doesn't change.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .corpus import Chunk, Paper
from .embed import embed_texts
from .store import Hit, NumpyStore


def build_dense_index(chunks: list[Chunk], vectors: np.ndarray) -> NumpyStore:
    store = NumpyStore()
    ids = [c.chunk_id for c in chunks]
    meta = [{"paper_id": c.paper_id} for c in chunks]
    store.add(ids, vectors, meta)
    return store


def paper_vectors(chunks: list[Chunk], vectors: np.ndarray) -> dict[str, np.ndarray]:
    """One vector per paper: the average of its chunk vectors, scaled back to length 1.

    Search works on chunks, but a signal is given on a whole paper — 👍 means
    "this paper", not "sentence three of it". Averaging a paper's chunks gives
    the single point that stands for it. Rescaling to length 1 keeps it
    comparable to the chunk vectors, which the store already assumes are unit
    length.
    """
    by_paper: dict[str, list[np.ndarray]] = {}
    for chunk_, vector in zip(chunks, vectors):
        by_paper.setdefault(chunk_.paper_id, []).append(vector)

    out: dict[str, np.ndarray] = {}
    for paper_id, chunk_vectors in by_paper.items():
        mean = np.mean(chunk_vectors, axis=0)
        norm = float(np.linalg.norm(mean))
        out[paper_id] = (mean / norm).astype(np.float32) if norm else mean.astype(np.float32)
    return out


@dataclass
class Index:
    """Everything the ranker needs about the corpus, built once and passed around.

    `store` answers "which chunks are nearest to this vector"; the two dicts
    answer questions about a whole paper — its record, its averaged vector
    (for the taste vector), and its chunk vectors (for scoring it against a
    vector the store was never asked about).
    """

    store: NumpyStore
    papers: dict[str, Paper]
    paper_vectors: dict[str, np.ndarray]
    chunk_vectors: dict[str, np.ndarray]   # per paper: a (chunks, dim) matrix

    def best_chunk_score(self, paper_id: str, vector: np.ndarray) -> float:
        """How well a paper matches `vector`, judged by its closest chunk — the
        same rule `dedupe_to_papers` uses, applied to one paper directly."""
        return float(np.max(self.chunk_vectors[paper_id] @ vector))


def build_index(papers: list[Paper], chunks: list[Chunk], vectors: np.ndarray) -> Index:
    by_paper: dict[str, list[np.ndarray]] = {}
    for chunk_, vector in zip(chunks, vectors):
        by_paper.setdefault(chunk_.paper_id, []).append(vector)
    return Index(
        store=build_dense_index(chunks, vectors),
        papers={p.id: p for p in papers},
        paper_vectors=paper_vectors(chunks, vectors),
        chunk_vectors={pid: np.stack(vs) for pid, vs in by_paper.items()},
    )


def dedupe_to_papers(hits: list[Hit], k: int) -> list[Hit]:
    """Collapse chunk-level hits to one (best-scoring) hit per paper, keeping rank order."""
    best: dict[str, Hit] = {}
    for hit in hits:
        current = best.get(hit.paper_id)
        if current is None or hit.score > current.score:
            best[hit.paper_id] = hit
    return sorted(best.values(), key=lambda h: -h.score)[:k]


def search(
    store: NumpyStore,
    query_text: str,
    k: int = 10,
    candidates_k: int = 40,
    dimensions: int | None = None,
) -> list[Hit]:
    """Dense search: embed the query, retrieve `candidates_k` chunks, collapse to `k` papers.

    `dimensions` must match whatever the store's own vectors were embedded
    with — a query embedded at a different length than the index can't be
    compared to it.
    """
    query_vector = embed_texts([query_text], dimensions=dimensions)[0]
    chunk_hits = store.search(query_vector, k=candidates_k)
    return dedupe_to_papers(chunk_hits, k)
