"""Paths, model ids, and shared constants.

Pinned here so a model rename or a path change is a one-line edit instead of a
grep across notebooks.
"""

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
INDEX_DIR = DATA_DIR / "index"
SESSIONS_DIR = DATA_DIR / "sessions"

PAPERS_FILE = DATA_DIR / "papers.jsonl"
GOLDEN_FILE = DATA_DIR / "golden.jsonl"
PROFILES_FILE = DATA_DIR / "profiles.json"
PERSONAS_FILE = DATA_DIR / "personas.json"

# notebook 1: the corpus
ARXIV_CATEGORIES = ["cs.CL", "cs.LG", "cs.AI", "cs.IR"]
ARXIV_SINCE = "2023-01-01"
ARXIV_TARGET_COUNT = 2000

# OpenAI, throughout. Confirm these ids are still current before notebook 3.
EMBEDDING_MODEL = "text-embedding-3-small"
QUERY_UNDERSTANDING_MODEL = "gpt-5-mini"
RERANK_MODEL = "gpt-5-mini"
FEEDBACK_MODEL = "gpt-5-mini"
EXPLANATION_MODEL = "gpt-5-mini"
JUDGE_MODEL = "gpt-5"
SIMULATED_USER_MODEL = "gpt-5"
