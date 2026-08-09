"""Case state — the one mutable thing a turn is allowed to touch.

Notebook 8 kept this in a module-level global. Here it is an ordinary dict that
gets passed explicitly to every tool, validator and agent run. That is not
tidiness for its own sake: once several agents are in flight at once, "which
case is this call about" has to be an argument, not an ambient fact.
"""

# The task is over when the case reaches one of these. `return_authorized` is
# deliberately NOT here — an authorized return still owes the customer a refund,
# so the loop should keep working.
TERMINAL_STATES = {"refunded", "escalated"}


def new_case() -> dict:
    """Fresh task state for one customer conversation.

    facts     order_id -> the eligibility result check_return_eligibility really
              returned. Action validators read this, so a return can only be
              authorized against eligibility that was actually checked.
    actions   the side effects taken so far, in order.
    findings  structured reports handed back by sub-agents (notebook 9).
    audit     every tool call attempted, allowed or denied (notebook 10).
    """
    return {"state": "open", "actions": [], "facts": {}, "findings": [], "audit": []}


def action_for(case: dict, tool_name: str, order_id: str | None = None) -> dict | None:
    """Find an action already taken on this case, optionally for one order."""
    return next(
        (
            a
            for a in case["actions"]
            if a["tool"] == tool_name
            and (order_id is None or a["order_id"] == order_id)
        ),
        None,
    )


def is_closed(case: dict) -> bool:
    return case["state"] in TERMINAL_STATES
