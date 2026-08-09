"""The hub-and-spoke system from notebook 9, promoted into the library.

This is the canonical copy. Notebook 9 defines the same coordinator, spokes,
Task tool and handoff contract in its own cells, because there they are the
subject being taught; here they are furniture that notebook 10 imports so it can
talk about enforcement instead of restating delegation. If you change one, change
the other — notebook 9's cells and this module are meant to say the same thing.

One thing genuinely changed in the move: `wrap`. Every dispatcher built here can
be wrapped by a caller before it runs, for every agent including sub-agents. That
is the seam notebook 10 pushes hooks through, and it is the reason a single rule
can cover calls made by agents this module has never heard of.
"""

import json
import threading

from .case import is_closed
from .data import find_order
from .runtime import log_event, run_agent
from .tools import execute_tool, tools_for
from .validate import semantic_validator

# --- the structured handoff --------------------------------------------------

REPORT_FINDING = {
    "name": "report_finding",
    "description": (
        "Report what you found and end your task. Call this exactly once, as your "
        "final action. Everything the coordinator will ever know about your work is "
        "in this call — anything you leave out is lost."
    ),
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "status": {
                "type": "string",
                "enum": ["ok", "blocked", "needs_human"],
                "description": (
                    "'ok' if you answered the objective; 'blocked' if you could not "
                    "(missing context, tool errors); 'needs_human' if what you found "
                    "is outside what any assistant may resolve."
                ),
            },
            "answer": {
                "type": "string",
                "description": "One or two sentences answering the objective directly.",
            },
            "facts": {
                "type": "array",
                "description": "The evidence behind your answer. Every claim cites the tool it came from.",
                "items": {
                    "type": "object",
                    "properties": {
                        "claim": {"type": "string", "description": "One specific, checkable fact."},
                        "source": {
                            "type": "string",
                            "description": "The exact name of the tool that returned it.",
                        },
                    },
                    "required": ["claim", "source"],
                    "additionalProperties": False,
                },
            },
            "unanswered": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Anything the objective asked that you could not determine, and why.",
            },
            "recommended_next": {
                "type": ["string", "null"],
                "description": (
                    "What you think should happen next, or null. Advice to the "
                    "coordinator, not an instruction — you are not deciding."
                ),
            },
            "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
        },
        "required": ["status", "answer", "facts", "unanswered", "recommended_next", "confidence"],
        "additionalProperties": False,
    },
}


@semantic_validator("report_finding")
def validate_finding(tool_input: dict, case: dict) -> list[str]:
    """Shape checks the schema can't express. The handoff is not exempt from
    validation just because it's internal — it is the most load-bearing call a
    sub-agent makes."""
    errors = []
    status = tool_input.get("status")

    if status == "ok" and not tool_input.get("facts"):
        errors.append(
            "status is 'ok' but you cited no facts. An answer with no evidence "
            "behind it is a guess — either cite what you found or report 'blocked'."
        )
    if status == "blocked" and not tool_input.get("unanswered"):
        errors.append(
            "status is 'blocked' but 'unanswered' is empty. Say what you could not "
            "determine, so the coordinator knows what is still missing."
        )
    if status == "needs_human" and not tool_input.get("recommended_next"):
        errors.append(
            "status is 'needs_human' but recommended_next is null. Say what a human "
            "should look at — this text is what they will read first."
        )
    if len(tool_input.get("answer", "").split()) < 4:
        errors.append("answer is too short to be a real answer to the objective.")

    return errors


# --- the spokes --------------------------------------------------------------

SPOKE_PREAMBLE = """You are {name}, a sub-agent inside a shop's support system.

You never speak to the customer and you cannot change anything: every tool you
have is read-only. You have been given one objective and a short brief. That
brief is everything you know — you cannot see the customer conversation, the
coordinator's reasoning, or what any other sub-agent is doing right now.

Gather what your objective needs, then call report_finding exactly once. That
call IS your answer; anything you write outside it is discarded unread. Every
fact you report must name the tool it came from. If the brief is missing
something you need, put it in `unanswered` rather than guessing, and never
report anything a tool did not actually return.

Choose your status honestly. `needs_human` is not a failure and not an escape
hatch — it means what you found is outside what any assistant is allowed to
resolve, and reporting `ok` in that situation is the single most damaging thing
you can do, because the coordinator can act on `ok`.

{role}"""

SPOKE_ROLES = {
    "order_investigation": """Your job is the order record and its physical history: does the order exist,
what state is it in, is it returnable under the return policy, and did the goods
ever actually reach the customer.

check_return_eligibility already folds the carrier record into its answer, so
run it whenever a return or refund might follow — it is what puts the eligibility
check on the record, and its blocking_reasons are authoritative.

Report `needs_human` when the goods never arrived: a carrier exception, a parcel
returned to sender, or a shipment with no scan for over a week. A customer who
never received an item has nothing to send back, so that is a lost shipment for a
human to resolve, not a return — whatever the order status says.

You establish facts. You do not decide whether a return should be granted, what
to tell the customer, or whether to escalate.""",
    "billing_analysis": """Your job is money: what was authorized, what was captured, what has already
been refunded, and whether anything is disputed.

Read the ledger carefully and report `needs_human` for any of these, because
none of them can be resolved by an assistant:
- two captures for the same order — the customer was charged twice
- a capture on a cancelled order — charged for goods never sent
- an open chargeback — the funds are held by the bank and nobody at the shop
  can move them

Those are billing disputes. A plain refund does not fix one and can pay the same
money twice. You cannot issue, approve or promise a refund yourself; say what you
think should happen in `recommended_next` and let the coordinator act.""",
    "policy_review": """Your job is the written policy, quoted accurately. You have no access to orders,
payments or shipments, and you must not assume anything about a specific order —
if the objective smuggles in a claim about one, treat it as a hypothetical.

Answer in the form "the policy says X", quoting the section, and put anything the
policy does not cover in `unanswered`. A gap in the policy is a finding; an
invented rule is a failure.""",
}

SPOKE_TOOLS = {
    "order_investigation": ["lookup_order", "check_return_eligibility", "get_shipment_events"],
    "billing_analysis": ["get_payment_events", "get_refund_status"],
    "policy_review": ["search_policy"],
}

SPOKE_NAMES = list(SPOKE_TOOLS)


def spoke_spec(name: str, model: str) -> dict:
    return {
        "name": name,
        "model": model,
        "system": SPOKE_PREAMBLE.format(name=name, role=SPOKE_ROLES[name]),
        "tools": tools_for(SPOKE_TOOLS[name]) + [REPORT_FINDING],
        # Calling this tool ends the run and its input becomes the result. A
        # sub-agent that just stops talking has failed, not finished.
        "final_tool": "report_finding",
        "max_iterations": 6,
    }


# --- delegation --------------------------------------------------------------

TASK_TOOL = {
    "name": "Task",
    "description": (
        "Hand one question to a sub-agent and get a structured finding back. The "
        "sub-agent starts with no memory of this conversation and sees only what you "
        "put in `context` — pass everything it needs. Issue several Task calls in one "
        "turn when the questions are independent; they run in parallel. Use "
        "include_findings when a question depends on what another sub-agent already "
        "reported."
    ),
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "agent": {
                "type": "string",
                "enum": SPOKE_NAMES,
                "description": (
                    "order_investigation: the order record, return eligibility, carrier "
                    "history. billing_analysis: charges, refunds, disputes. "
                    "policy_review: what the written policy says (it cannot see orders)."
                ),
            },
            "objective": {
                "type": "string",
                "description": (
                    "The single question this sub-agent should answer, stated so it can "
                    "be answered with its tools alone — not a plan, and not an instruction to act."
                ),
            },
            "context": {
                "type": "object",
                "description": "Everything the sub-agent gets to know. It sees nothing else.",
                "properties": {
                    "order_id": {
                        "type": ["string", "null"],
                        "description": "The order in question, or null if the question isn't about one.",
                    },
                    "customer_statement": {
                        "type": ["string", "null"],
                        "description": "What the customer actually said, in their words, if it matters.",
                    },
                    "notes": {
                        "type": ["string", "null"],
                        "description": "Anything else the sub-agent needs that it cannot look up.",
                    },
                },
                "required": ["order_id", "customer_statement", "notes"],
                "additionalProperties": False,
            },
            "include_findings": {
                "type": "array",
                "items": {"type": "string", "enum": SPOKE_NAMES},
                "description": (
                    "Names of sub-agents whose findings should be forwarded. Only agents "
                    "that have already reported on this case."
                ),
            },
        },
        "required": ["agent", "objective", "context", "include_findings"],
        "additionalProperties": False,
    },
}


@semantic_validator("Task")
def validate_task(tool_input: dict, case: dict) -> list[str]:
    """Gate on delegation itself: is this task answerable as written?"""
    errors = []
    agent = tool_input.get("agent")
    context = tool_input.get("context") or {}
    order_id = context.get("order_id")

    if len(tool_input.get("objective", "").split()) < 5:
        errors.append(
            "objective is too thin. The sub-agent cannot see this conversation, so a "
            "few words are not enough — state the whole question."
        )
    if order_id is not None and find_order(order_id) is None:
        errors.append(
            f"order_id '{order_id}' doesn't match any order. Don't send a sub-agent "
            "chasing an order that doesn't exist — check it or pass null."
        )
    if agent == "policy_review" and order_id is not None:
        errors.append(
            "policy_review has no access to orders, so passing an order_id only "
            "tempts it to guess. Ask the policy question in general terms."
        )

    reported = {f["agent"] for f in case["findings"]}
    missing = [n for n in tool_input.get("include_findings", []) if n not in reported]
    if missing:
        errors.append(
            f"include_findings names {missing}, which has not reported on this case yet. "
            "You cannot forward a finding that doesn't exist — run that task first, or "
            "drop it from the list."
        )
    if agent in tool_input.get("include_findings", []):
        errors.append(f"'{agent}' cannot be sent its own earlier finding.")

    return errors


def build_brief(task: dict, case: dict) -> str:
    """The sub-agent's entire universe, as one user message.

    Findings travel as JSON, not prose: summarising a finding to pass it on is
    how a chain of agents turns facts into rumour.
    """
    context = task["context"]
    lines = [f"OBJECTIVE\n{task['objective']}", "", "CONTEXT"]
    lines += [
        f"- {key}: {context[key]}"
        for key in ("order_id", "customer_statement", "notes")
        if context.get(key)
    ] or ["- (none given)"]

    forwarded = [f for f in case["findings"] if f["agent"] in task["include_findings"]]
    if forwarded:
        lines += ["", "FINDINGS FROM OTHER SUB-AGENTS", json.dumps(forwarded, indent=2)]

    lines += ["", "Answer the objective with your tools, then call report_finding."]
    return "\n".join(lines)


def verify_sources(finding: dict, tools_called: list[str]) -> dict:
    """Check each fact's cited tool against the tools this spoke actually ran."""
    unverified = [
        fact["claim"]
        for fact in finding.get("facts", [])
        if fact.get("source") not in tools_called
    ]
    return {**finding, "tools_called": tools_called, "unverified_claims": unverified}


# Sub-agents run concurrently and share one case dict. Guard what they append.
CASE_LOCK = threading.Lock()
TASK_LOG = []


def run_task(client, task: dict, case: dict, *, model: str, wrap=None, on_event=log_event):
    """Run one sub-agent in its own context and return its finding as a tool result.

    `wrap(dispatch, agent_name)` lets a caller interpose on the sub-agent's tool
    calls too. Without it a hook would only ever see the coordinator, which would
    make "no sub-agent may write" unenforceable at exactly the layer that matters.
    """
    agent = task["agent"]
    tools_called: list[str] = []

    def spoke_dispatch(name, tool_input, case):
        if name == "report_finding":
            # The handoff needs no implementation: the call itself is the result.
            # It stays out of the ledger — citing it as a source proves nothing.
            return json.dumps({"received": True}), False

        tools_called.append(name)
        return execute_tool(name, tool_input, case)

    dispatch = wrap(spoke_dispatch, agent) if wrap else spoke_dispatch

    brief = build_brief(task, case)
    # THE isolation line: a brand-new conversation containing only the brief.
    spoke_messages = [{"role": "user", "content": brief}]

    print(f"[Task → {agent}] {task['objective']}")
    outcome = run_agent(
        client, spoke_spec(agent, model), spoke_messages, case,
        dispatch=dispatch, on_event=on_event,
    )

    finding = outcome["result"]
    if finding is None:
        # The spoke stopped without reporting. The coordinator gets a finding
        # regardless: silence is indistinguishable from "nothing was wrong".
        finding = {
            "status": "blocked",
            "answer": f"{agent} ended without reporting a finding ({outcome['stop']}).",
            "facts": [],
            "unanswered": [task["objective"]],
            "recommended_next": "Re-task with more context, or handle this without it.",
            "confidence": "low",
        }

    finding = verify_sources(
        {"agent": agent, "objective": task["objective"], **finding}, tools_called
    )

    with CASE_LOCK:
        case["findings"].append(finding)
        TASK_LOG.append({
            "agent": agent,
            "objective": task["objective"],
            "brief_chars": len(brief),
            "tools_called": tools_called,
            "iterations": outcome["iterations"],
            "usage": outcome["usage"],
        })

    return json.dumps(finding), False


# --- findings as facts on the case -------------------------------------------


def findings_needing_human(case: dict) -> list[dict]:
    return [f for f in case["findings"] if f["status"] == "needs_human"]


def _human_only(action: str, case: dict) -> list[str]:
    flagged = findings_needing_human(case)
    if not flagged:
        return []

    reasons = " ".join(f"{f['agent']} reported: {f['answer']}" for f in flagged)
    return [
        f"You may not {action} on this case — a sub-agent has flagged it for a "
        f"human. {reasons} Escalate with escalate_to_human, summarising everything "
        "found so far. Do not resolve part of the case and escalate the rest: the "
        "escalation is the resolution."
    ]


@semantic_validator("create_return_authorization")
def block_rma_when_human_needed(tool_input: dict, case: dict) -> list[str]:
    return _human_only("authorize a return", case)


@semantic_validator("issue_refund")
def block_refund_when_human_needed(tool_input: dict, case: dict) -> list[str]:
    return _human_only("issue a refund", case)


# --- the coordinator ---------------------------------------------------------

COORDINATOR_SYSTEM = """You are the coordinator for an online shop's support desk. You talk to the
customer, you decide what needs to be found out, and you are the only part of
this system that can change anything.

## Return policy

- Items can be returned within 30 days of the order date.
- Only orders that were actually delivered or shipped can be returned. A
  cancelled or still-processing order was never delivered, so there is nothing
  to send back.
- An approved return gets an RMA number first, then a refund for the full order
  total. The refund is never issued without an RMA.
- If the goods never reached the customer — the carrier reported damage,
  returned the parcel to sender, or simply stopped scanning it — that is a lost
  shipment, not a return. There is nothing to send back, and a human chooses
  between a replacement and a refund.
- Billing disputes — charged for something they didn't receive, charged twice,
  or a chargeback opened by their bank — are not returns either, and a refund
  does not resolve one. A human handles those.

## Your team

You cannot investigate anything yourself. Three sub-agents can, and you reach
them with the Task tool:

- **order_investigation** — the order record, return eligibility, carrier
  history. Use it for anything about the order or whether the goods arrived.
- **billing_analysis** — what was charged, what was refunded, whether anything
  is disputed. Use it whenever money is in question.
- **policy_review** — quotes the written policy. It cannot see orders, so ask it
  general questions.

Each sub-agent starts with no memory of this conversation and sees only what you
put in `context`. Pass the order ID and the customer's own words; a sub-agent
given a vague brief will correctly tell you it couldn't answer.

Send several Task calls in one turn when the questions don't depend on each
other — they run at the same time. Chain a later Task with include_findings when
it does depend on an earlier answer. Don't delegate what you can already answer
from a finding you have, and don't re-task an agent to confirm something it
already told you. If a return might follow, say so in the objective the first
time you ask, so eligibility is checked in one pass rather than two.

Sub-agents advise; you decide. A finding that says "issue a refund" is an
opinion from something that cannot issue refunds.

## Acting

Only you can create_return_authorization, issue_refund and escalate_to_human.
A return can only be authorized once order_investigation has actually checked
eligibility for that order — the tool will refuse otherwise, and that is
deliberate, not a bug to work around.

Before you act, read every finding you have, not just the most recent one. **If
any finding reports needs_human, the case is not yours to resolve — escalate it,
and do nothing else.** Handling the part you can and escalating the rest is the
one sequence you must never run: it closes the case while the customer's real
problem is still open. If you find yourself about to refund one thing and hand
another to a human, escalate the whole case instead.

Everything your sub-agents found is attached to the ticket automatically, so
write the escalation summary for a human reading it cold.

## Hard rules

1. Never tell the customer something has happened until the tool returned
   ok: true. If a tool fails or is rejected, say plainly that it didn't go
   through — never describe a failed action as if it succeeded.
2. Never state a fact no finding gave you. If a finding lists something under
   `unverified_claims` or reports low confidence, don't repeat it as certain.
3. Don't invent policy. If the rules above don't cover it, ask policy_review or
   escalate.
4. One resolution per case, and it has to cover the whole problem. If the
   customer raised two issues and only one is yours to fix, the case goes to a
   human with both attached.
5. Never narrate what you are about to do. Don't write "let me check that",
   don't announce a step, and never write a tool name in a message. Do the work
   first, then tell the customer what is true.

Be warm and direct. Keep replies short — this is a support chat, not a letter.
The customer never hears about sub-agents, tasks or findings; they hear an answer.
"""

CLOSED_CASE_NOTE = """CLOSING MESSAGE. This case is now closed and this is the last thing you will
say — the conversation ends here and you will not see a reply. Write a short
sign-off that confirms what was done, quotes the RMA, refund, or ticket number,
and says what happens next and roughly when.

Describe only what actually happened. If you were part-way through something
else when the case closed, do not mention it, do not promise it, and do not
apologise for it. Do not offer further help, do not ask whether there's anything
else, and do not ask any question at all.
"""

UNRESOLVED_NOTE = """CLOSING MESSAGE. You could not complete this request, and no action was taken —
no return was authorized, no refund was issued, no ticket was filed. Say so
honestly without inventing a reason, and never imply anything happened. Tell the
customer in one or two sentences what you need from them to move forward.
"""

COORDINATOR_TOOLS = [
    "lookup_order",
    "create_return_authorization",
    "issue_refund",
    "escalate_to_human",
]


def coordinator_spec(model: str) -> dict:
    return {
        "name": "coordinator",
        "model": model,
        "system": COORDINATOR_SYSTEM,
        # Task sits alongside the levers: delegating and acting are the same kind
        # of move as far as the loop is concerned.
        "tools": tools_for(COORDINATOR_TOOLS) + [TASK_TOOL],
        "parallel": True,
        "max_tokens": 1500,
        "closing_notes": {"closed": CLOSED_CASE_NOTE, "unresolved": UNRESOLVED_NOTE},
    }


def make_dispatch(client, *, spoke_model: str, wrap=None, on_event=log_event):
    """The coordinator's dispatcher: one extra branch for Task.

    `wrap` is threaded through to sub-agents as well as applied here, so an
    interposer sees every tool call in the system, not just the hub's.
    """

    def dispatch(tool_name, tool_input, case):
        if tool_name == "Task":
            return run_task(
                client, tool_input, case,
                model=spoke_model, wrap=wrap, on_event=on_event,
            )

        return execute_tool(tool_name, tool_input, case)

    return wrap(dispatch, "coordinator") if wrap else dispatch


def send_message(
    client, messages: list, case: dict, *,
    coordinator_model: str, spoke_model: str, wrap=None, on_event=log_event,
) -> str:
    """One customer turn, start to finish."""
    outcome = run_agent(
        client,
        coordinator_spec(coordinator_model),
        messages,
        case,
        dispatch=make_dispatch(
            client, spoke_model=spoke_model, wrap=wrap, on_event=on_event
        ),
        stop_when=lambda c: f"case closed ({c['state']})" if is_closed(c) else None,
        on_event=on_event,
    )
    return outcome["text"]
