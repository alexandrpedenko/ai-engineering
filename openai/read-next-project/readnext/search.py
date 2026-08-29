"""Turn a query into results: build a dense index from chunks, then search it.

Notebook 3 is dense-only — one retriever, one store. Later notebooks extend
this file with lexical search, fusion, filters, and diversity, but the shape
started here (embed the query, search the store, collapse chunks to papers)
doesn't change.
"""

from __future__ import annotations

import numpy as np

from .corpus import Chunk
from .embed import embed_texts
from .store import Hit, NumpyStore


def build_dense_index(chunks: list[Chunk], vectors: np.ndarray) -> NumpyStore:
    store = NumpyStore()
    ids = [c.chunk_id for c in chunks]
    meta = [{"paper_id": c.paper_id} for c in chunks]
    store.add(ids, vectors, meta)
    return store


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
