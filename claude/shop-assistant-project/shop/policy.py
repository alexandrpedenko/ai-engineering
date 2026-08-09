"""The return policy as facts, not judgements.

`policy.md` is the same policy written for people and for retrieval. This module
is the part of it that has to be computed, and it is deliberately the only place
where a return-window number lives in code.
"""

from datetime import date

from .data import shipment_events

NON_RETURNABLE_STATUSES = {"cancelled", "processing"}
RETURN_WINDOW_DAYS = 30
# policy.md: a parcel with no carrier scan for this long is treated as delayed.
STALLED_SHIPMENT_DAYS = 10


def eligibility_facts(order: dict, today: date | None = None) -> dict:
    """What is true about this order under the return policy.

    Returns `returnable` plus the reasons it isn't — and nothing about what to do
    next. Deciding is the model's job; the action validators hold the boundary.

    The carrier record is part of this, not a separate question. An order can sit
    inside the return window with a perfectly healthy status and still be
    unreturnable because the goods never arrived — you cannot send back what you
    never received. Leaving that out of the fact source is how a system ends up
    issuing an RMA for a parcel the carrier destroyed.
    """
    today = today or date.today()
    days_since_order = (today - date.fromisoformat(order["order_date"])).days

    blocking_reasons = []
    if order["status"] in NON_RETURNABLE_STATUSES:
        blocking_reasons.append(
            f"order status is '{order['status']}' — it was never delivered, "
            "so there is nothing to send back"
        )
    if days_since_order > RETURN_WINDOW_DAYS:
        blocking_reasons.append(
            f"ordered {days_since_order} days ago, outside the "
            f"{RETURN_WINDOW_DAYS}-day return window"
        )

    events = shipment_events(order["order_id"])
    types = {e["type"] for e in events}
    last_scan = events[-1]["date"] if events else None
    days_since_last_scan = (
        (today - date.fromisoformat(last_scan)).days if last_scan else None
    )

    if types & {"exception", "returned_to_sender"} and "delivered" not in types:
        blocking_reasons.append(
            "the carrier never delivered this parcel — it was damaged or returned "
            "to sender, so the customer has nothing to send back. This is a lost "
            "shipment, not a return, and a human decides between replacement and refund"
        )
    elif (
        "delivered" not in types
        and days_since_last_scan is not None
        and days_since_last_scan >= STALLED_SHIPMENT_DAYS
    ):
        blocking_reasons.append(
            f"no carrier scan for {days_since_last_scan} days and no delivery on "
            "record — the parcel is delayed or lost, which a human resolves rather "
            "than a return"
        )

    return {
        "delivery": {
            "delivered": "delivered" in types,
            "exception": "exception" in types,
            "returned_to_sender": "returned_to_sender" in types,
            "days_since_last_scan": days_since_last_scan,
        },
        "order_id": order["order_id"],
        "exists": True,
        "status": order["status"],
        "item": order["item"],
        "total": order["total"],
        "days_since_order": days_since_order,
        "return_window_days": RETURN_WINDOW_DAYS,
        "returnable": not blocking_reasons,
        "blocking_reasons": blocking_reasons,
    }
