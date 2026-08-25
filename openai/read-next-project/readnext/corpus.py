"""Fetch the arXiv corpus and normalize it into the record contract.

The `Paper` shape here is frozen — every later notebook reads papers.jsonl
through `load()` and assumes exactly these fields.
"""

from __future__ import annotations

import json
import re
import time
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Literal

import requests
import tiktoken

from .config import (
    ARXIV_CATEGORIES,
    ARXIV_SINCE,
    ARXIV_TARGET_COUNT,
    EMBEDDING_ENCODING,
    EMBEDDING_PRICE_PER_1M_TOKENS,
    PAPERS_FILE,
)

ARXIV_API_URL = "http://export.arxiv.org/api/query"
NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "arxiv": "http://arxiv.org/schemas/atom",
}
PAGE_SIZE = 100
REQUEST_DELAY_SECONDS = 3.0  # arXiv's API etiquette guideline


@dataclass
class Paper:
    id: str
    title: str
    abstract: str
    authors: list[str]
    categories: list[str]
    primary_category: str
    published: str
    updated: str
    url: str


def _text(el: ET.Element, path: str) -> str:
    node = el.find(path, NS)
    return node.text.strip() if node is not None and node.text else ""


def _parse_entry(entry: ET.Element) -> Paper:
    arxiv_id = _text(entry, "atom:id").rsplit("/", 1)[-1]
    authors = [_text(a, "atom:name") for a in entry.findall("atom:author", NS)]
    categories = [c.get("term") for c in entry.findall("atom:category", NS)]
    primary = entry.find("arxiv:primary_category", NS)
    primary_category = primary.get("term") if primary is not None else categories[0]
    return Paper(
        id=arxiv_id,
        title=" ".join(_text(entry, "atom:title").split()),
        abstract=" ".join(_text(entry, "atom:summary").split()),
        authors=authors,
        categories=categories,
        primary_category=primary_category,
        published=_text(entry, "atom:published")[:10],
        updated=_text(entry, "atom:updated")[:10],
        url=f"https://arxiv.org/abs/{arxiv_id}",
    )


def fetch_category(category: str, since: str, max_results: int = ARXIV_TARGET_COUNT) -> list[Paper]:
    """Page through one category's submissions, newest first, stopping at `since`."""
    papers: list[Paper] = []
    start = 0
    while len(papers) < max_results:
        params = {
            "search_query": f"cat:{category}",
            "start": start,
            "max_results": min(PAGE_SIZE, max_results - len(papers)),
            "sortBy": "submittedDate",
            "sortOrder": "descending",
        }
        resp = requests.get(ARXIV_API_URL, params=params, timeout=30)
        resp.raise_for_status()
        entries = ET.fromstring(resp.content).findall("atom:entry", NS)
        if not entries:
            break

        hit_since = False
        for entry in entries:
            paper = _parse_entry(entry)
            if paper.published < since:
                hit_since = True
                break
            papers.append(paper)

        if hit_since or len(entries) < PAGE_SIZE:
            break

        start += PAGE_SIZE
        time.sleep(REQUEST_DELAY_SECONDS)

    return papers[:max_results]


def fetch_corpus(
    categories: list[str] = ARXIV_CATEGORIES,
    since: str = ARXIV_SINCE,
    target_total: int = ARXIV_TARGET_COUNT,
) -> list[Paper]:
    """Fetch each category and merge, unioning categories for papers that appear in more than one."""
    per_category = target_total // len(categories)
    by_id: dict[str, Paper] = {}
    for i, category in enumerate(categories):
        for paper in fetch_category(category, since, max_results=per_category):
            if paper.id in by_id:
                existing = by_id[paper.id]
                existing.categories = sorted(set(existing.categories) | set(paper.categories))
            else:
                by_id[paper.id] = paper
        if i < len(categories) - 1:
            time.sleep(REQUEST_DELAY_SECONDS)
    return list(by_id.values())


def save(papers: list[Paper], path: Path = PAPERS_FILE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as f:
        for paper in papers:
            f.write(json.dumps(asdict(paper)) + "\n")


def load(path: Path = PAPERS_FILE) -> list[Paper]:
    with path.open() as f:
        return [Paper(**json.loads(line)) for line in f]


_ENCODING = tiktoken.get_encoding(EMBEDDING_ENCODING)


def count_tokens(text: str) -> int:
    return len(_ENCODING.encode(text))


def estimate_embedding_cost(texts: list[str]) -> tuple[int, float]:
    """Total tokens and USD for embedding these texts, at today's per-token price."""
    total_tokens = sum(count_tokens(t) for t in texts)
    return total_tokens, total_tokens / 1_000_000 * EMBEDDING_PRICE_PER_1M_TOKENS


_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


def _split_sentences(text: str) -> list[str]:
    return [s for s in _SENTENCE_SPLIT_RE.split(text.strip()) if s]


@dataclass
class Chunk:
    chunk_id: str
    paper_id: str
    text: str       # the unit that gets embedded
    context: str     # the unit that gets shown/returned — equal to `text` unless small-to-big


ChunkStrategy = Literal["whole", "window", "small_to_big"]


def chunk(papers: list[Paper], strategy: ChunkStrategy, window_size: int = 2, overlap: int = 1) -> list[Chunk]:
    """Split each paper's abstract into embeddable units, per `strategy`.

    - "whole": one chunk, the full abstract.
    - "window": fixed sentence windows (`window_size` sentences, `overlap` shared
      between consecutive windows) — narrower units, but nothing points back to
      the abstract they came from.
    - "small_to_big": the same windows as above, except each chunk's `context`
      is the full abstract — embed narrow, return wide.
    """
    chunks: list[Chunk] = []
    stride = window_size - overlap
    for paper in papers:
        if strategy == "whole":
            chunks.append(Chunk(f"{paper.id}:0", paper.id, paper.abstract, paper.abstract))
            continue

        sentences = _split_sentences(paper.abstract)
        starts = range(0, max(len(sentences) - window_size, 0) + 1, stride) if sentences else [0]
        for i, start in enumerate(starts):
            window_text = " ".join(sentences[start : start + window_size]) or paper.abstract
            context = paper.abstract if strategy == "small_to_big" else window_text
            chunks.append(Chunk(f"{paper.id}:{i}", paper.id, window_text, context))

    return chunks
