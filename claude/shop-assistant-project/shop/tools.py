"""The shop's domain tools: fact sources, one extractor, three levers.

Lifted from notebook 8 with two changes. First, `case` is an explicit argument
instead of a global. Second, the schemas live in a dict keyed by name, because
notebook 9 hands each agent a *subset* of them — an agent that cannot see a tool
cannot call it, and that is the first of the two layers that keep a spoke inside
its lane.

The four fact tools at the bottom (payments, refunds, shipments, policy) are new
in notebook 9. They exist so the sub-agents have genuinely different evidence to
gather; none of them decides anything.
"""

import json
import uuid
from datetime import date

from . import data
from .case import action_for
from .policy import eligibility_facts

# Tools that change the world. Everything else is read-only.
ACTION_TOOLS = {"create_return_authorization", "issue_refund", "escalate_to_human"}

_ORDER_ID_PROPERTY = {
    "type": "string",
    "description": "The order ID, e.g. A1001.",
}

TOOLS: dict[str, dict] = {
    "lookup_order": {
        "name": "lookup_order",
        "description": (
            "Look up an order by its order ID and return its item, status, order date, "
            "and total. Call this whenever the customer references an order number or "
            "asks about the state of an existing order. Returns an error result if no "
            "such order exists."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {"order_id": _ORDER_ID_PROPERTY},
            "required": ["order_id"],
            "additionalProperties": False,
        },
    },
    "check_return_eligibility": {
        # FACT SOURCE. Reports what is true about the order against the return
        # policy; it does not say what to do.
        "name": "check_return_eligibility",
        "description": (
            "Check an order against the return policy and report the facts: whether the "
            "order exists, its status, how many days old it is, whether it falls inside "
            "the return window, and any reasons a return is blocked. This tells you what "
            "is TRUE, not what to do — decide that yourself and explain it to the "
            "customer. Call this before authorizing any return."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {"order_id": _ORDER_ID_PROPERTY},
            "required": ["order_id"],
            "additionalProperties": False,
        },
    },
    "get_payment_events": {
        "name": "get_payment_events",
        "description": (
            "Return the payment ledger for an order — authorizations, captures, refunds "
            "and chargebacks — plus totals derived from it. Use this to establish what "
            "the customer was actually charged, whether they were charged twice, and "
            "whether money is currently held by a dispute."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {"order_id": _ORDER_ID_PROPERTY},
            "required": ["order_id"],
            "additionalProperties": False,
        },
    },
    "get_refund_status": {
        "name": "get_refund_status",
        "description": (
            "Report what has already been refunded on an order, from both the payment "
            "ledger and the shop's own refund records. Read-only: this never moves money."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {"order_id": _ORDER_ID_PROPERTY},
            "required": ["order_id"],
            "additionalProperties": False,
        },
    },
    "get_shipment_events": {
        "name": "get_shipment_events",
        "description": (
            "Return the carrier scan history for an order, plus how long it has been "
            "since the last scan and whether a delivery, exception or return-to-sender "
            "was ever recorded. Use this to establish whether the goods reached the "
            "customer."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {"order_id": _ORDER_ID_PROPERTY},
            "required": ["order_id"],
            "additionalProperties": False,
        },
    },
    "search_policy": {
        "name": "search_policy",
        "description": (
            "Search the written support policy and return the matching sections in full. "
            "Quote what you find rather than paraphrasing it — the exact wording is what "
            "another agent or a human will rely on."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "What you need the policy to answer, e.g. 'refund on a chargeback'.",
                }
            },
            "required": ["query"],
            "additionalProperties": False,
        },
    },
    "extract_return_request": {
        # EXTRACTION ONLY. Records, echoes, routes nowhere.
        "name": "extract_return_request",
        "description": (
            "Record a customer's return or refund request as structured data. This is "
            "bookkeeping, not a decision: the result is your own extraction echoed back, "
            "so you can see what you captured and what is still missing. It does not "
            "authorize anything."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {
                    "type": ["string", "null"],
                    "description": "The order ID mentioned by the customer, or null if they haven't given one.",
                },
                "reason": {
                    "type": "string",
                    "enum": [
                        "defective_item",
                        "wrong_item_shipped",
                        "changed_mind",
                        "billing_dispute",
                        "late_delivery",
                        "unclear",
                        "other",
                    ],
                    "description": "The customer's stated reason. Use 'unclear' if not stated clearly enough to classify.",
                },
                "urgency": {
                    "type": "string",
                    "enum": ["low", "medium", "high"],
                    "description": "How urgent the request sounds, based on tone and content.",
                },
                "missing_information": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": ["order_id", "reason", "item_condition", "preferred_resolution"],
                    },
                    "description": "Which pieces of information the customer has not yet provided.",
                },
                "summary": {
                    "type": "string",
                    "description": "One-sentence, neutral summary of what the customer wants.",
                },
            },
            "required": ["order_id", "reason", "urgency", "missing_information", "summary"],
            "additionalProperties": False,
        },
    },
    "create_return_authorization": {
        # ACTION. Writes an RMA record.
        "name": "create_return_authorization",
        "description": (
            "Authorize a return and issue an RMA number. This writes a real record. Only "
            "call it once check_return_eligibility has confirmed the order is returnable "
            "— the call is rejected otherwise. Do not tell the customer their return is "
            "approved until this returns ok: true."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": _ORDER_ID_PROPERTY,
                "reason": {
                    "type": "string",
                    "enum": [
                        "defective_item",
                        "wrong_item_shipped",
                        "changed_mind",
                        "late_delivery",
                        "other",
                    ],
                    "description": "The approved return reason.",
                },
                "note": {
                    "type": "string",
                    "description": "One-sentence note for the warehouse team about the condition or context of the return.",
                },
            },
            "required": ["order_id", "reason", "note"],
            "additionalProperties": False,
        },
    },
    "issue_refund": {
        # ACTION. Ordering constraint: an RMA must exist for this order first.
        "name": "issue_refund",
        "description": (
            "Refund the customer for an authorized return. Requires an RMA for the same "
            "order to exist already — call create_return_authorization first. The amount "
            "must match the order total exactly. This writes a real record; don't tell "
            "the customer they've been refunded until it returns ok: true."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": _ORDER_ID_PROPERTY,
                "amount": {
                    "type": "number",
                    "description": "The refund amount. Must equal the order total.",
                },
            },
            "required": ["order_id", "amount"],
            "additionalProperties": False,
        },
    },
    "escalate_to_human": {
        # ACTION. Files a ticket and hands the case to a human.
        "name": "escalate_to_human",
        "description": (
            "File a ticket for a human specialist and hand the case off. Use your "
            "judgement: escalate when the request needs a human — billing disputes, "
            "angry customers, policy exceptions you can't grant, or anything the other "
            "tools can't resolve. Don't tell the customer you're escalating until this "
            "returns ok: true."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "order_id": {
                    "type": ["string", "null"],
                    "description": "The order ID if known, or null if the customer never gave a valid one.",
                },
                "reason": {
                    "type": "string",
                    "enum": [
                        "billing_dispute",
                        "high_urgency",
                        "order_not_found",
                        "policy_exception",
                        "other",
                    ],
                    "description": "Why this needs a human.",
                },
                "urgency": {
                    "type": "string",
                    "enum": ["low", "medium", "high"],
                    "description": "How urgently a human should pick this up.",
                },
                "summary": {
                    "type": "string",
                    "description": (
                        "Neutral summary for the specialist who picks this up, including "
                        "anything the customer told you that isn't in the order record."
                    ),
                },
            },
            "required": ["order_id", "reason", "urgency", "summary"],
            "additionalProperties": False,
        },
    },
}


def tools_for(names) -> list[dict]:
    """The API `tools` array for one agent. Unknown names fail loudly, here,
    rather than as a confusing model error three calls later."""
    unknown = [n for n in names if n not in TOOLS]
    if unknown:
        raise KeyError(f"No such tool(s): {unknown}")

    return [TOOLS[name] for name in names]


# --- fact sources -----------------------------------------------------------


def lookup_order(case: dict, order_id: str) -> tuple[str, bool]:
    order = data.find_order(order_id)
    if order is None:
        # A failed call, not a successfully-retrieved fact.
        return f"No order found with ID '{order_id}'.", True

    return json.dumps(order), False


def check_return_eligibility(case: dict, order_id: str) -> tuple[str, bool]:
    """FACT SOURCE: what is true about this order under the return policy.

    Returns no decision, no next step, no suggested wording. It also records what
    it found onto the case — that record, not the model's assertion, is what the
    action validators trust.
    """
    order = data.find_order(order_id)
    if order is None:
        return json.dumps({"order_id": order_id, "exists": False}), True

    facts = eligibility_facts(order)
    case["facts"][order["order_id"].upper()] = facts
    return json.dumps(facts), False


def get_payment_events(case: dict, order_id: str) -> tuple[str, bool]:
    order = data.find_order(order_id)
    if order is None:
        return f"No order found with ID '{order_id}'.", True

    events = data.payment_events(order_id)
    captures = [e for e in events if e["type"] == "captured"]
    refunds = [e for e in events if e["type"] == "refunded"]

    return json.dumps({
        "order_id": order["order_id"],
        "order_total": order["total"],
        "events": events,
        "amount_captured": round(sum(e["amount"] for e in captures), 2),
        "amount_refunded": round(sum(e["amount"] for e in refunds), 2),
        "capture_count": len(captures),
        "chargeback_open": any(e["type"] == "chargeback_opened" for e in events),
    }), False


def get_refund_status(case: dict, order_id: str) -> tuple[str, bool]:
    order = data.find_order(order_id)
    if order is None:
        return f"No order found with ID '{order_id}'.", True

    ledger = [e for e in data.payment_events(order_id) if e["type"] == "refunded"]
    written = data.records_in(data.REFUNDS_FILE, order_id)
    refunded = round(sum(e["amount"] for e in ledger) + sum(r["amount"] for r in written), 2)

    return json.dumps({
        "order_id": order["order_id"],
        "order_total": order["total"],
        "amount_refunded": refunded,
        "fully_refunded": round(refunded * 100) >= round(order["total"] * 100),
        "ledger_refunds": ledger,
        "shop_refunds": written,
    }), False


def get_shipment_events(case: dict, order_id: str) -> tuple[str, bool]:
    order = data.find_order(order_id)
    if order is None:
        return f"No order found with ID '{order_id}'.", True

    events = data.shipment_events(order_id)
    types = {e["type"] for e in events}
    last_scan = events[-1]["date"] if events else None

    return json.dumps({
        "order_id": order["order_id"],
        "order_status": order["status"],
        "events": events,
        "last_scan_date": last_scan,
        "days_since_last_scan": (
            (date.today() - date.fromisoformat(last_scan)).days if last_scan else None
        ),
        "delivered": "delivered" in types,
        "exception": "exception" in types,
        "returned_to_sender": "returned_to_sender" in types,
    }), False


def search_policy(case: dict, query: str) -> tuple[str, bool]:
    matches = data.search_policy_sections(query)
    if not matches:
        # An empty retrieval is a failure to answer, not an answer of "no policy".
        return f"No policy section matched '{query}'. Try different wording.", True

    return json.dumps({"query": query, "sections": matches}), False


def extract_return_request(case: dict, **extraction) -> tuple[str, bool]:
    """EXTRACTION ONLY: echo the structured request back. Decides nothing."""
    return json.dumps({"recorded": extraction}), False


# --- actions ----------------------------------------------------------------


def create_return_authorization(case: dict, order_id: str, reason: str, note: str) -> tuple[str, bool]:
    facts = case["facts"].get(order_id.upper())
    # Last line of defence. The validator already checked this; if it were ever
    # bypassed, this is what stops a bad RMA reaching disk.
    if not facts or not facts["returnable"]:
        return json.dumps({
            "ok": False,
            "error": f"Order '{order_id}' is not confirmed returnable — no RMA created.",
        }), True

    existing = action_for(case, "create_return_authorization", facts["order_id"])
    if existing:
        # Idempotency: a retrying model must not open two RMAs.
        return json.dumps({
            "ok": True,
            "rma_id": existing["id"],
            "note": "This order already has an authorized return; returning the existing RMA.",
        }), False

    rma_id = f"RMA-{uuid.uuid4().hex[:8].upper()}"
    data.append_record(data.RETURNS_FILE, {
        "rma_id": rma_id,
        "order_id": facts["order_id"],
        "item": facts["item"],
        "refund_amount": facts["total"],
        "reason": reason,
        "note": note,
        "created_at": date.today().isoformat(),
    })

    case["state"] = "return_authorized"
    case["actions"].append({
        "tool": "create_return_authorization",
        "order_id": facts["order_id"],
        "id": rma_id,
    })

    return json.dumps({
        "ok": True,
        "rma_id": rma_id,
        "item": facts["item"],
        "refund_amount": facts["total"],
        "ship_back_within_days": 14,
    }), False


def issue_refund(case: dict, order_id: str, amount: float) -> tuple[str, bool]:
    rma = action_for(case, "create_return_authorization", order_id.upper())
    if rma is None:
        return json.dumps({
            "ok": False,
            "error": f"No authorized return exists for '{order_id}' — refund refused.",
        }), True

    existing = action_for(case, "issue_refund", order_id.upper())
    if existing:
        return json.dumps({
            "ok": True,
            "refund_id": existing["id"],
            "note": "This order was already refunded; returning the existing refund.",
        }), False

    refund_id = f"REF-{uuid.uuid4().hex[:8].upper()}"
    data.append_record(data.REFUNDS_FILE, {
        "refund_id": refund_id,
        "rma_id": rma["id"],
        "order_id": order_id.upper(),
        "amount": amount,
        "created_at": date.today().isoformat(),
    })

    case["state"] = "refunded"
    case["actions"].append({"tool": "issue_refund", "order_id": order_id.upper(), "id": refund_id})

    return json.dumps({
        "ok": True,
        "refund_id": refund_id,
        "amount": amount,
        "settles_within_days": 5,
    }), False


def escalate_to_human(case: dict, order_id, reason: str, urgency: str, summary: str) -> tuple[str, bool]:
    existing = action_for(case, "escalate_to_human")
    if existing:
        return json.dumps({
            "ok": True,
            "ticket_id": existing["id"],
            "note": "This case is already escalated; returning the existing ticket.",
        }), False

    ticket_id = f"ESC-{uuid.uuid4().hex[:6].upper()}"
    data.append_record(data.ESCALATIONS_FILE, {
        "ticket_id": ticket_id,
        "order_id": order_id,
        "reason": reason,
        "urgency": urgency,
        "summary": summary,
        # Notebook 9: whatever the sub-agents established travels with the
        # ticket, so the human starts where the machine stopped.
        "findings": case.get("findings", []),
        # Notebook 10: so does what the system *refused* to do. A human reading
        # this cold needs to know the assistant tried to refund a disputed charge
        # and was stopped — that is often the most important fact on the ticket.
        "denied_attempts": [
            entry for entry in case.get("audit", []) if entry.get("decision") == "deny"
        ],
        "created_at": date.today().isoformat(),
    })

    case["state"] = "escalated"
    case["actions"].append({
        "tool": "escalate_to_human",
        "order_id": order_id.upper() if order_id else None,
        "id": ticket_id,
    })

    return json.dumps({
        "ok": True,
        "ticket_id": ticket_id,
        "response_within_hours": 4 if urgency == "high" else 24,
        "findings_attached": len(case.get("findings", [])),
    }), False


_IMPLEMENTATIONS = {
    "lookup_order": lambda c, i: lookup_order(c, i["order_id"]),
    "check_return_eligibility": lambda c, i: check_return_eligibility(c, i["order_id"]),
    "get_payment_events": lambda c, i: get_payment_events(c, i["order_id"]),
    "get_refund_status": lambda c, i: get_refund_status(c, i["order_id"]),
    "get_shipment_events": lambda c, i: get_shipment_events(c, i["order_id"]),
    "search_policy": lambda c, i: search_policy(c, i["query"]),
    "extract_return_request": lambda c, i: extract_return_request(c, **i),
    "create_return_authorization": lambda c, i: create_return_authorization(c, **i),
    "issue_refund": lambda c, i: issue_refund(c, **i),
    "escalate_to_human": lambda c, i: escalate_to_human(c, **i),
}


def execute_tool(tool_name: str, tool_input: dict, case: dict) -> tuple[str, bool]:
    """Dispatch a tool_use block to its implementation. Returns (result, is_error).

    No routing cleverness: each name maps to the function of the same name.
    Notebook 6's bug — an extraction tool secretly invoking the business rules —
    was possible because this function had opinions.
    """
    impl = _IMPLEMENTATIONS.get(tool_name)
    if impl is None:
        return f"Unknown tool '{tool_name}'.", True

    return impl(case, tool_input)
