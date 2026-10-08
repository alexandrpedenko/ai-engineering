"""Paths and tracing setup shared by every book."""

import os
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
REPO_ROOT = PROJECT_ROOT.parent.parent

load_dotenv(REPO_ROOT / ".env")


def configure_tracing(book: int) -> None:
    """Turn on LangSmith tracing for this book, one project per book."""
    if not os.environ.get("LANGSMITH_API_KEY"):
        print("No LANGSMITH_API_KEY set — tracing is off, everything else still works.")
        return
    os.environ["LANGSMITH_TRACING"] = "true"
    os.environ["LANGSMITH_PROJECT"] = f"tripgraph-book-{book}"
