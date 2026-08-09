"""Two layers: the tool's own JSON schema, then the semantics it can't express.

A validator knows one tool's arguments intimately and knows nothing about who is
calling it. That division matters from notebook 10 onward, where hooks take the
other half of the job: they know the caller and the case, and nothing about any
particular tool's arguments.

Validators here are registered by tool name, so a notebook can add one for a tool
it defines itself (the `Task` tool in notebook 9) without editing this file.
"""

import re

from jsonschema import Draft7Validator

from .case import TERMINAL_STATES, action_for
from .data import find_order, payment_events
from .tools import ACTION_TOOLS, TOOLS

_ORDER_ID_RE = re.compile(r"^[A-Za-z]\d+$")

# tool name -> [callable(tool_input, case) -> list[str] of error messages].
# A list, not a single function: a tool can have several independent gates, and a
# notebook that adds one should not silently replace the ones defined here.
SEMANTIC_VALIDATORS: dict[str, list] = {}


def semantic_validator(tool_name: str):
    """Register a semantic validator for one tool. All registered gates run."""

    def register(fn):
        gates = SEMANTIC_VALIDATORS.setdefault(tool_name, [])
        # Replace by qualified name rather than appending blindly, so re-running
        # a notebook cell re-registers instead of stacking duplicates.
        key = f"{fn.__module__}.{fn.__qualname__}"
        for i, existing in enumerate(gates):
            if f"{existing.__module__}.{existing.__qualname__}" == key:
                gates[i] = fn
                return fn

        gates.append(fn)
        return fn

    return register


def validate_schema(tool_name: str, tool_input: dict, schemas: dict | None = None) -> list[str]:
    """Validate tool_input against the tool's own JSON schema."""
    schema = (schemas or TOOLS).get(tool_name)
    if schema is None:
        return [f"Unknown tool '{tool_name}'."]

    validator = Draft7Validator(schema["input_schema"])
    return [error.message for error in validator.iter_errors(tool_input)]


@semantic_validator("extract_return_request")
def validate_return_request(tool_input: dict, case: dict) -> list[str]:
    """Consistency checks the schema can't express."""
    errors = []

    order_id = tool_input.get("order_id")
    missing = tool_input.get("missing_information", [])
    summary = tool_input.get("summary", "")

    if order_id is not None:
        if not _ORDER_ID_RE.match(order_id.strip()):
            errors.append(
                f"order_id '{order_id}' doesn't look like a valid order ID "
                "(expected a letter followed by digits, e.g. A1001)."
            )
        if "order_id" in missing:
            errors.append(
                "order_id is set but 'order_id' is also listed in missing_information — "
                "these are inconsistent."
            )
    elif "order_id" not in missing:
        errors.append("order_id is null but 'order_id' is not listed in missing_information.")

    if not summary.strip():
        errors.append("summary is empty — provide a one-sentence neutral summary.")
    elif len(summary.split()) < 3:
        errors.append("summary is too short to be a meaningful one-sentence summary.")

    return errors


@semantic_validator("create_return_authorization")
def validate_return_authorization(tool_input: dict, case: dict) -> list[str]:
    # The gate is a FACT, not a decision: eligibility must have actually been
    # checked for this order, and must have actually come back returnable.
    order_id = tool_input.get("order_id")
    facts = case["facts"].get((order_id or "").upper())

    if facts is None:
        return [
            f"No eligibility check on record for '{order_id}'. Call "
            "check_return_eligibility for this order before authorizing a return."
        ]
    if not facts["returnable"]:
        return [
            f"Order '{facts['order_id']}' is not returnable: "
            + "; ".join(facts["blocking_reasons"])
            + ". Explain this to the customer rather than authorizing a return. "
            "If they say they were charged anyway, that's a billing dispute — "
            "escalate_to_human instead."
        ]

    return []


@semantic_validator("issue_refund")
def validate_refund_not_disputed(tool_input: dict, case: dict) -> list[str]:
    """Money that is already contested is not ours to move.

    This reads the payment ledger directly rather than trusting anything reported
    up the chain. A refund on a disputed charge is the most expensive mistake in
    this system — it pays the same money twice — so the gate on it should not
    depend on a model having classified the case correctly first.
    """
    order_id = tool_input.get("order_id")
    if not order_id:
        return []

    events = payment_events(order_id)
    errors = []

    if any(e["type"] == "chargeback_opened" for e in events):
        errors.append(
            f"A chargeback is open on '{order_id}': the funds are held by the payment "
            "processor and the shop cannot move them. Refunding now would pay the same "
            "money twice. Escalate to a human instead."
        )

    captures = [e for e in events if e["type"] == "captured"]
    if len(captures) > 1:
        total = round(sum(e["amount"] for e in captures), 2)
        errors.append(
            f"'{order_id}' has {len(captures)} captures totalling {total} — the customer "
            "was charged more than once. That is a billing dispute, not a return, and a "
            "refund for the order total would leave the duplicate charge in place. "
            "Escalate to a human."
        )

    return errors


@semantic_validator("issue_refund")
def validate_refund(tool_input: dict, case: dict) -> list[str]:
    errors = []
    order_id = tool_input.get("order_id")

    # Ordering constraint between two actions, enforced rather than requested.
    if action_for(case, "create_return_authorization", (order_id or "").upper()) is None:
        errors.append(
            f"No return has been authorized for '{order_id}'. Call "
            "create_return_authorization first — a refund without an RMA means "
            "nobody ever asked the customer to send the item back."
        )

    order = find_order(order_id) if order_id else None
    amount = tool_input.get("amount")
    if order is not None and amount is not None:
        # Money: exact match only, compared in cents to dodge float drift.
        if round(amount * 100) != round(order["total"] * 100):
            errors.append(
                f"amount {amount} doesn't match the order total {order['total']}. "
                "Refund the exact order total."
            )

    return errors


@semantic_validator("escalate_to_human")
def validate_escalation(tool_input: dict, case: dict) -> list[str]:
    # No decision gate — escalation is the model's judgement call. What's checked
    # is that the ticket is honest and usable by whoever picks it up cold.
    errors = []
    order_id = tool_input.get("order_id")

    if order_id is not None and find_order(order_id) is None:
        errors.append(
            f"order_id '{order_id}' doesn't match any order — pass null instead "
            "and explain the situation in the summary."
        )
    if len(tool_input.get("summary", "").split()) < 5:
        errors.append(
            "summary is too thin — a human is going to read this cold, so include "
            "what the customer wants and anything they told you."
        )

    return errors


def validate_tool_call(
    tool_name: str, tool_input: dict, case: dict, schemas: dict | None = None
) -> list[str]:
    """Schema validation, then (if that passes) tool-specific semantic validation."""
    errors = validate_schema(tool_name, tool_input, schemas)
    if errors:
        return errors

    if tool_name in ACTION_TOOLS and case["state"] in TERMINAL_STATES:
        return [
            f"This case is already in state '{case['state']}' — it's finished. "
            "Don't take another action on it."
        ]

    errors = []
    for check in SEMANTIC_VALIDATORS.get(tool_name, []):
        errors += check(tool_input, case)

    return errors
