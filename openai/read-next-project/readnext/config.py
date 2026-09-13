"""Paths, model ids, and shared constants.

Pinned here so a model rename or a path change is a one-line edit instead of a
grep across notebooks.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
INDEX_DIR = DATA_DIR / "index"
PROFILES_DIR = DATA_DIR / "profiles"

PAPERS_FILE = DATA_DIR / "papers.jsonl"
EVENTS_FILE = DATA_DIR / "events.jsonl"
PERSONAS_FILE = DATA_DIR / "personas.json"

# notebook 1: the corpus
ARXIV_CATEGORIES = ["cs.CL", "cs.LG", "cs.AI", "cs.IR"]
ARXIV_SINCE = "2023-01-01"
ARXIV_TARGET_COUNT = 2000

# OpenAI, throughout. Confirm these ids (and the price below) are still current before notebook 3.
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_ENCODING = "cl100k_base"
EMBEDDING_PRICE_PER_1M_TOKENS = 0.02  # USD, as of this project's writing
EMBEDDING_BATCH_SIZE = 100

# notebook 2: embeddings
EMBEDDING_CACHE_DIR = INDEX_DIR / "embedding_cache"
COST_LOG_FILE = INDEX_DIR / "cost_log.jsonl"
QUERY_UNDERSTANDING_MODEL = "gpt-5-mini"
RERANK_MODEL = "gpt-5-mini"
FEEDBACK_MODEL = "gpt-5-mini"
EXPLANATION_MODEL = "gpt-5-mini"
JUDGE_MODEL = "gpt-5"
SIMULATED_USER_MODEL = "gpt-5"


# notebook 4: the app
@dataclass
class PipelineConfig:
    """Every switch and dial the ranking reads, in one place (ADR-0011).

    A row of book 5's ablation table is this with one field changed. The
    defaults are book 4's behaviour, so `PipelineConfig()` is the baseline.
    Flags for techniques from later books are already here so an event logged
    today records the same shape as one logged after book 8.
    """

    use_structured_query: bool = False   # book 6
    use_bm25: bool = False               # book 7
    use_rerank: bool = False             # book 8
    use_mmr: bool = False                # book 8
    fusion: Literal["rrf", "weighted"] = "rrf"
    alpha: float = 0.7        # query vs taste: 1 ignores the user, 0 ignores the query
    gamma: float = 0.5        # how hard a dislike pushes the taste vector away
    candidate_chunks: int = 200   # chunks pulled from the store in stage 1
    candidates_k: int = 40        # papers kept as the stage-1 pool
    final_k: int = 5              # papers that reach the screen
