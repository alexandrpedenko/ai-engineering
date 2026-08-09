"""Flat-file data access for the shop.

Everything here is a read or an append against a JSON file next to the
notebooks. Paths are resolved from this file's location rather than the current
working directory, so a notebook works no matter where the kernel was started.
"""

import json
import re
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent

ORDERS_FILE = DATA_DIR / "orders.json"
PAYMENTS_FILE = DATA_DIR / "payments.json"
SHIPMENTS_FILE = DATA_DIR / "shipments.json"
POLICY_FILE = DATA_DIR / "policy.md"

RETURNS_FILE = DATA_DIR / "returns.json"
REFUNDS_FILE = DATA_DIR / "refunds.json"
ESCALATIONS_FILE = DATA_DIR / "escalations.json"


def _load(path: Path) -> list[dict]:
    return json.loads(path.read_text()) if path.exists() else []


def find_order(order_id: str) -> dict | None:
    """Look up one order in orders.json, case- and whitespace-insensitively.

    Models paste order IDs out of customer messages, so leading spaces and mixed
    case are normal input, not malformed input. Being strict here would mean a
    validator rejecting a call that names a real order.
    """
    orders = _load(ORDERS_FILE)
    wanted = (order_id or "").strip().lower()
    return next((o for o in orders if o["order_id"].lower() == wanted), None)


def events_for(path: Path, order_id: str) -> list[dict]:
    """Every event on one order, oldest first."""
    return [e for e in _load(path) if e["order_id"].lower() == order_id.lower()]


def payment_events(order_id: str) -> list[dict]:
    return events_for(PAYMENTS_FILE, order_id)


def shipment_events(order_id: str) -> list[dict]:
    return events_for(SHIPMENTS_FILE, order_id)


def append_record(path: Path, record: dict) -> None:
    """Append a record to a JSON array file, creating it if it doesn't exist."""
    records = _load(path)
    records.append(record)
    path.write_text(json.dumps(records, indent=2) + "\n")


def records_in(path: Path, order_id: str) -> list[dict]:
    """Records already written for one order — refunds, RMAs, tickets."""
    return [
        r
        for r in _load(path)
        if (r.get("order_id") or "").lower() == order_id.lower()
    ]


def reset_records() -> list[str]:
    """Delete the append-only files this system writes. Returns what was removed.

    Worth doing between runs, and not only for tidiness. These files are *inputs*
    to the fact tools as well as outputs of the action tools: an RMA or refund
    left over from an earlier run shows up in get_refund_status the next time,
    and a sub-agent will faithfully report that the customer has already been
    refunded. Stale state doesn't break the run, it quietly changes the answer.
    """
    removed = []
    for path in (RETURNS_FILE, REFUNDS_FILE, ESCALATIONS_FILE):
        if path.exists():
            path.unlink()
            removed.append(path.name)

    return removed


def policy_sections() -> list[dict]:
    """Split policy.md into its `##` sections. One section is one retrievable unit."""
    text = POLICY_FILE.read_text()
    sections = []
    for chunk in re.split(r"^## ", text, flags=re.MULTILINE)[1:]:
        title, _, body = chunk.partition("\n")
        sections.append({"title": title.strip(), "body": body.strip()})
    return sections


def search_policy_sections(query: str, limit: int = 3) -> list[dict]:
    """Keyword retrieval over the policy: score sections by query-term overlap.

    Deliberately dumb — no embeddings, no chunking cleverness. The lesson in the
    notebook is about who is allowed to read the policy and what they may do
    with it, not about retrieval quality.
    """
    terms = {t for t in re.findall(r"[a-z]+", query.lower()) if len(t) > 3}
    scored = []
    for section in policy_sections():
        haystack = f"{section['title']} {section['body']}".lower()
        score = sum(haystack.count(term) for term in terms)
        # A title hit is worth more than a passing mention in the body.
        score += 3 * sum(term in section["title"].lower() for term in terms)
        if score:
            scored.append((score, section))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [section for _, section in scored[:limit]]
