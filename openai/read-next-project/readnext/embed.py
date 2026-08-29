"""Text to vectors: batched OpenAI calls, a content-hashed disk cache, a cost log.

The cache key is a hash of the model id and the exact text — change either and
you get a fresh embedding, not a stale one. Every call that actually reaches
the API appends one line to `COST_LOG_FILE`, so "what did this notebook cost"
is always answerable from the log, not from memory.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from openai import OpenAI

from .config import (
    COST_LOG_FILE,
    EMBEDDING_BATCH_SIZE,
    EMBEDDING_CACHE_DIR,
    EMBEDDING_MODEL,
    EMBEDDING_PRICE_PER_1M_TOKENS,
)

_client: OpenAI | None = None


def get_client() -> OpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY not set — check the repo-root .env")
        _client = OpenAI(api_key=api_key)
    return _client


def _cache_key(text: str, model: str) -> str:
    return hashlib.sha256(f"{model}:{text}".encode()).hexdigest()


def _cache_path(key: str, cache_dir: Path) -> Path:
    return cache_dir / f"{key}.npy"


def _log_cost(model: str, num_texts: int, num_cached: int, tokens: int) -> None:
    COST_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "model": model,
        "texts_requested": num_texts,
        "texts_cached": num_cached,
        "texts_embedded": num_texts - num_cached,
        "tokens": tokens,
        "cost_usd": tokens / 1_000_000 * EMBEDDING_PRICE_PER_1M_TOKENS,
    }
    with COST_LOG_FILE.open("a") as f:
        f.write(json.dumps(record) + "\n")


def embed_texts(
    texts: list[str],
    model: str = EMBEDDING_MODEL,
    cache_dir: Path = EMBEDDING_CACHE_DIR,
    batch_size: int = EMBEDDING_BATCH_SIZE,
) -> np.ndarray:
    """Embed each text, in order, using the on-disk cache where possible.

    Returns a `(len(texts), dim)` float32 matrix. Only texts missing from the
    cache trigger an API call; those calls are batched and logged.
    """
    cache_dir.mkdir(parents=True, exist_ok=True)
    keys = [_cache_key(t, model) for t in texts]
    vectors: list[np.ndarray | None] = [None] * len(texts)

    to_fetch: list[int] = []
    for i, key in enumerate(keys):
        path = _cache_path(key, cache_dir)
        if path.exists():
            vectors[i] = np.load(path)
        else:
            to_fetch.append(i)

    tokens_billed = 0
    client = get_client() if to_fetch else None
    for start in range(0, len(to_fetch), batch_size):
        batch_idx = to_fetch[start : start + batch_size]
        batch_texts = [texts[i] for i in batch_idx]
        response = client.embeddings.create(input=batch_texts, model=model)
        tokens_billed += response.usage.total_tokens
        for idx, item in zip(batch_idx, response.data):
            vector = np.array(item.embedding, dtype=np.float32)
            vectors[idx] = vector
            np.save(_cache_path(keys[idx], cache_dir), vector)

    if to_fetch:
        _log_cost(model, len(texts), len(texts) - len(to_fetch), tokens_billed)

    return np.stack(vectors)


def cache_size(cache_dir: Path = EMBEDDING_CACHE_DIR) -> int:
    """Number of vectors currently on disk."""
    if not cache_dir.exists():
        return 0
    return sum(1 for _ in cache_dir.glob("*.npy"))


def total_cost(log_path: Path = COST_LOG_FILE) -> float:
    """Sum of every logged run's cost, in USD."""
    if not log_path.exists():
        return 0.0
    with log_path.open() as f:
        return sum(json.loads(line)["cost_usd"] for line in f)
