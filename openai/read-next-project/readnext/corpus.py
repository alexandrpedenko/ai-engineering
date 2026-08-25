"""Fetch the arXiv corpus and normalize it into the record contract.

The `Paper` shape here is frozen — every later notebook reads papers.jsonl
through `load()` and assumes exactly these fields.
"""

from __future__ import annotations

import json
import time
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass
from pathlib import Path

import requests

from .config import ARXIV_CATEGORIES, ARXIV_SINCE, ARXIV_TARGET_COUNT, PAPERS_FILE

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
