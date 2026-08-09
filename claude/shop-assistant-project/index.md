# Shop assistant — file index

A support assistant for a fictional online shop, built up one layer at a time.
It starts as a single Messages API call and ends as a hub-and-spoke multi-agent
system whose security properties are enforced at runtime and testable without a
model in the loop.

Two rules explain the layout:

- **A notebook contains only its own subject.** Anything an earlier notebook
  already taught gets promoted into [`shop/`](shop/) and imported from there.
- **The JSON files are the shop's world.** Action tools append to them, fact
  tools read them back — so leftover state from a previous run silently becomes
  evidence in the next one. `shop.data.reset_records()` clears the writable ones.

## Notebooks

Run them in order; each one assumes the previous.

### [1-request.ipynb](1-request.ipynb)
The smallest possible thing that works: one `client.messages.create` call, the
content-block structure of a response, and `stop_reason`.

### [2-multi-turn.ipynb](2-multi-turn.ipynb)
The API is stateless, so a "conversation" is a growing `{role, content}` list
resent on every request. Enough for the assistant to ask "which order?" and use
the answer in the next turn.

### [3-conversation-loop.ipynb](3-conversation-loop.ipynb)
A real chat loop with a system prompt, `add_user_message` / `add_assistant_message`
helpers, and an interactive `input()` REPL.

### [4-evals-model-based-grader.ipynb](4-evals-model-based-grader.ipynb)
Two ways to grade. Exact-match scoring over an intent-classification test set,
then a **model-based grader** that judges free-form replies against a written
rubric — for outputs with no single correct answer.

### [5-tool-use-struct-schema-output copy.ipynb](5-tool-use-struct-schema-output%20copy.ipynb)
Tool use proper: `input_schema` definitions, the `tool_use` → `tool_result`
round trip, and using a tool schema as **structured output** (`extract_return_request`
pulls a typed object out of messy prose).

### [6-validation-and-retry.ipynb](6-validation-and-retry.ipynb)
Never trust a tool call. **Schema validation** re-checks arguments with
`jsonschema`; **semantic validation** checks what the schema can't express (does
this order exist, do the facts support this?). Failures go back to the model as
an error result so it can retry.

### [7-action-tools.ipynb](7-action-tools.ipynb)
Tools that *write*: `create_return_authorization`, `issue_refund`,
`escalate_to_human`. Introduces **case state** — the actions taken, the facts
established, and a terminal state that closes the case.

### [8-agentic-loop.ipynb](8-agentic-loop.ipynb)
Workflow becomes agent. The model chooses its own sequence of tools until it
decides it's done, bounded by `MAX_ITERATIONS` and an explicit end-of-loop
signal rather than a fixed script.

### [9-coordinator-and-subagents.ipynb](9-coordinator-and-subagents.ipynb)
One agent becomes several, because the ceiling is context. A **coordinator**
delegates via a `Task` tool to three isolated read-only spokes
(`order_investigation`, `billing_analysis`, `policy_review`), each with its own
tool subset, its own conversation, and a schema'd handoff (`report_finding`:
status, answer, facts with sources, unanswered, recommended next). Two models on
purpose — Sonnet routes, Haiku investigates.

### [10-hooks-and-enforcement.ipynb](10-hooks-and-enforcement.ipynb)
The layer that knows the *caller* and nothing about the tool. `PreToolUse` hooks
allow / deny / rewrite every call in the system; `PostToolUse` hooks rewrite
results before they reach any context. Gives four things:

- `only_the_coordinator_may_act` — "no sub-agent may write" as one rule instead
  of a property that held by accident
- `redact_card_numbers` — PANs masked before they can enter a conversation
- an **audit trail** written by the engine, which `no_repeat_calls` then reads,
  so it can't rot into a file nobody checks
- enforcement that is testable with no model involved

## The `shop/` package

Notebooks 1–8's material, promoted so notebooks 9 and 10 can be about their own
subject. [`shop/agents.py`](shop/agents.py) is the canonical copy of notebook 9.

| Module | Contents |
| --- | --- |
| [`__init__.py`](shop/__init__.py) | The public surface — re-exports everything the notebooks import |
| [`case.py`](shop/case.py) | `new_case()`, `is_closed()`, `action_for()`, `TERMINAL_STATES`. Case state is an explicit argument, never a global — with several agents in flight, "which case is this?" has to be passed |
| [`data.py`](shop/data.py) | Flat-file access: `find_order`, `payment_events`, `shipment_events`, `append_record`, `search_policy_sections`, `reset_records`. Paths resolve from the module, not the CWD |
| [`policy.py`](shop/policy.py) | `eligibility_facts()` and `RETURN_WINDOW_DAYS` — the policy as *facts*, not judgements. Deciding is the model's job |
| [`tools.py`](shop/tools.py) | All tool schemas keyed by name + their implementations. `tools_for(names)` hands an agent a subset; `ACTION_TOOLS` names the three that change the world |
| [`validate.py`](shop/validate.py) | Schema layer, then per-tool semantic gates registered via `@semantic_validator`. A validator knows one tool's arguments and nothing about the caller |
| [`runtime.py`](shop/runtime.py) | `run_agent()` — the one loop that runs every agent. Coordinator and spoke differ only by spec. Seams: `dispatch` (what executes a call) and `stop_when` |
| [`agents.py`](shop/agents.py) | The hub-and-spoke system: `coordinator_spec`, `spoke_spec`, `SPOKE_TOOLS`, `TASK_TOOL`, `REPORT_FINDING`, `run_task`, `build_brief`, `send_message`. Every dispatcher accepts `wrap(dispatch, agent_name)` — the seam notebook 10 pushes hooks through |

## Data

| File | Role |
| --- | --- |
| [orders.json](orders.json) | The order catalogue — item, status, order date, total |
| [payments.json](payments.json) | Payment ledger: authorizations, captures, chargebacks. Contains full test-card PANs on purpose, which is what makes `redact_card_numbers` a real demo |
| [shipments.json](shipments.json) | Carrier scans — label created, in transit, delivered, exceptions |
| [policy.md](policy.md) | The return policy, written for humans and for retrieval by `search_policy` |
| `returns.json`, `refunds.json`, `escalations.json` | **Written at runtime** by the action tools and read back by the fact tools. Clear with `reset_records()` |
