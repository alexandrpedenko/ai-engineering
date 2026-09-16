"""Model ids, paths, and tracing setup shared by every book."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"

CHAT_MODEL = "anthropic:claude-sonnet-5"
CHEAP_MODEL = "anthropic:claude-haiku-4-5-20251001"
EMBEDDING_MODEL = "text-embedding-3-small"

TODAY = "2026-09-13"  # fixed, ADR-0002 — never parsed from user text


def configure_tracing(book: int) -> None:
    """Turn on LangSmith tracing for this book, one project per book."""
    if not os.environ.get("LANGSMITH_API_KEY"):
        print("No LANGSMITH_API_KEY set — tracing is off, calls still work.")
        return
    os.environ["LANGSMITH_TRACING"] = "true"
    os.environ["LANGSMITH_PROJECT"] = f"hotelbot-book-{book}"
