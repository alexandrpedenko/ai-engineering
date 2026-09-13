"""The ranking function: two stages, no state.

Stage 1, `retrieve`, asks the store what is about the query — the same answer
for every user. Stage 2, `rerank`, orders that pool by a blend of the query
and this user's taste. `recommend` is the two in sequence.

Nothing here touches a session, the disk, or a global. That is what lets book
5 call it thousands of times over logged candidates with a different config
each time (ADR-0007, ADR-0011).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .config import PipelineConfig
from .corpus import Paper
from .profile import Profile
from .search import Index, dedupe_to_papers


@dataclass
class Recommendation:
    paper: Paper
    score: float
    why: str = ""                                        # book 8 fills these
    citations: list[str] = field(default_factory=list)


def blend(query_vector: np.ndarray, taste_vector: np.ndarray | None, alpha: float) -> np.ndarray:
    """`alpha` parts query to `1 - alpha` parts taste, rescaled to length 1.

    With no taste vector (cold start) the query comes back unchanged, so a
    brand-new user gets plain search rather than an error.
    """
    if taste_vector is None:
        return query_vector
    mixed = alpha * query_vector + (1.0 - alpha) * taste_vector
    norm = float(np.linalg.norm(mixed))
    return (mixed / norm).astype(np.float32) if norm else query_vector


def retrieve(
    index: Index,
    query_vector: np.ndarray,
    config: PipelineConfig,
    exclude: frozenset[str] = frozenset(),
) -> list[str]:
    """Stage 1: the `candidates_k` papers most about the query, best chunk first.

    Reads only the query — never the profile — so the pool is the same for
    every user. Papers in `exclude` are dropped before the cut, so a seen paper
    never costs the pool a slot.
    """
    chunk_hits = index.store.search(query_vector, k=config.candidate_chunks)
    paper_hits = dedupe_to_papers(chunk_hits, k=len(chunk_hits))
    return [h.paper_id for h in paper_hits if h.paper_id not in exclude][: config.candidates_k]


def rerank(
    index: Index,
    candidates: list[str],
    query_vector: np.ndarray,
    profile: Profile,
    config: PipelineConfig,
) -> list[Recommendation]:
    """Stage 2: order the pool by its best-chunk score against the blended vector.

    Each candidate is scored the way book 3 scored a paper — by its closest
    chunk — but against `alpha · query + (1 − alpha) · taste` instead of the
    query alone. At cold start the blend *is* the query, so the order is
    exactly stage 1's.
    """
    taste = profile.taste_vector(index.paper_vectors, gamma=config.gamma)
    search_vector = blend(query_vector, taste, config.alpha)
    scored = [(pid, index.best_chunk_score(pid, search_vector)) for pid in candidates]
    scored.sort(key=lambda item: -item[1])
    return [Recommendation(paper=index.papers[pid], score=s) for pid, s in scored[: config.final_k]]


def recommend(
    index: Index,
    query_vector: np.ndarray,
    profile: Profile,
    config: PipelineConfig,
    exclude: frozenset[str] = frozenset(),
) -> list[Recommendation]:
    """Both stages: retrieve a pool for the query, then order it for this user."""
    candidates = retrieve(index, query_vector, config, exclude)
    return rerank(index, candidates, query_vector, profile, config)
