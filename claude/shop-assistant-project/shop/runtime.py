"""The agent loop from notebook 8, with every global turned into an argument.

One function runs every agent in the system. A coordinator and a sub-agent
differ only in their spec — prompt, tool list, how they finish — which is the
whole claim of the hub-and-spoke design: the spokes are not a different kind of
thing, they are the same loop pointed at a narrower job.

Two seams are deliberate:

`dispatch`  what actually executes a validated tool call. Notebook 9 passes a
            dispatcher that also knows how to run a sub-agent; notebook 10 wraps
            it in hooks. The loop itself never learns about either.
`stop_when` an external reason to end the turn, checked after each round of tool
            results. The coordinator uses it for terminal case states.
"""

from concurrent.futures import ThreadPoolExecutor

from .tools import execute_tool
from .validate import validate_tool_call

MAX_VALIDATION_RETRIES = 2
# Backstop on the tool-use loop: a hard stop, felt by us, not by the model.
MAX_ITERATIONS = 10
# Hard per-response cap. The model never sees it — that's what makes it a
# guillotine rather than a budget.
MAX_TOKENS = 1024


def text_of(response) -> str:
    """Join a response's text blocks into one string. Never raises.

    A response can legitimately have no text block — a refusal, a truncated turn,
    or a turn that was pure tool_use — and the caller still needs something.
    """
    parts = [block.text for block in response.content if block.type == "text"]
    joined = "\n".join(parts).strip()
    return joined or f"(no text in response; stop_reason={response.stop_reason})"


def log_event(event: dict) -> None:
    """Default event sink: one line per event, tagged with the agent that caused it.

    Every agent logs through this, so a parallel fan-out stays readable — the tag
    is the only way to tell two simultaneous spokes apart.
    """
    tag = f"[{event['agent']}]"
    kind = event["type"]

    if kind == "tool_call":
        print(f"{tag} → {event['tool']}({event['input']})")
    elif kind == "tool_result":
        flag = " ERROR" if event["is_error"] else ""
        print(f"{tag} ←{flag} {event['tool']}: {event['result'][:160]}")
    elif kind == "rejected":
        print(f"{tag} ✗ {event['tool']} rejected ({event['label']}): {event['errors']}")
    else:
        print(f"{tag} {kind}: {event.get('detail', '')}")


def _stop_message(stop_reason: str) -> str | None:
    """Customer-facing text for the stop reasons that end a turn on the spot.

    Notebook 8's table, unchanged. `refusal` is handled before response.content is
    read anywhere, because on a refusal that array can be empty.
    """
    return {
        "refusal": (
            "Sorry — I'm not able to help with that one. If this is about an order, "
            "tell me the order ID and what went wrong and I'll take another look."
        ),
        "max_tokens": "Sorry — I ran out of room mid-reply. Could you send that again?",
        "model_context_window_exceeded": (
            "Sorry — this conversation has got too long for me to keep track of. "
            "Could you start a fresh one with your order ID?"
        ),
    }.get(stop_reason)


def run_agent(
    client,
    spec: dict,
    messages: list,
    case: dict,
    *,
    dispatch=None,
    stop_when=None,
    on_event=log_event,
) -> dict:
    """Run one agent to completion. Returns a result dict, never raises on model errors.

    spec keys
      name            label used in events
      model           model id
      system          system prompt
      tools           list of tool schemas this agent may call — its entire world
      final_tool      optional tool name that ends the run; its validated input
                      becomes result["result"] (this is how a sub-agent hands
                      structured work back instead of prose)
      closing_notes   optional {"closed": str, "unresolved": str} for a written
                      sign-off; omit for agents nobody is reading directly
      parallel        run several tool calls from one turn concurrently
      max_iterations  optional override
      max_tokens      optional override

    result keys: text, result, stop, iterations, usage
    """
    dispatch = dispatch or (lambda name, tool_input, case: execute_tool(name, tool_input, case))
    schemas = {tool["name"]: tool for tool in spec["tools"]}
    notes = spec.get("closing_notes") or {}
    agent = spec["name"]
    usage = {"input_tokens": 0, "output_tokens": 0}

    def call(system, with_tools=True):
        kwargs = {
            "model": spec["model"],
            "max_tokens": spec.get("max_tokens", MAX_TOKENS),
            "system": system,
            "messages": messages,
        }
        if with_tools:
            kwargs["tools"] = spec["tools"]

        response = client.messages.create(**kwargs)
        usage["input_tokens"] += response.usage.input_tokens
        usage["output_tokens"] += response.usage.output_tokens
        return response

    def done(stop, text, result=None, iterations=0):
        return {
            "agent": agent,
            "text": text,
            "result": result,
            "stop": stop,
            "iterations": iterations,
            "usage": usage,
        }

    def finish(stop, note_key, iterations):
        """End the turn with a written sign-off and no ability to act.

        The `tools` array is omitted from this request entirely — not sent with
        tool_choice "none". The difference is not cosmetic. This exit usually
        fires while the model still intends to do something, and a model that can
        see a tool it is forbidden to call will often *write* the call instead:
        the tool name as prose, then a correction, then another attempt, all of
        it straight into the customer's chat window. Take the tools out of the
        request and there is nothing left to imitate.
        """
        on_event({"agent": agent, "type": "finish", "detail": stop})
        note = notes.get(note_key)
        if note is None:
            return done(stop, "", iterations=iterations)

        final = call(spec["system"] + "\n\n" + note, with_tools=False)
        messages.append({"role": "assistant", "content": final.content})
        return done(stop, text_of(final), iterations=iterations)

    validation_retries = 0
    pause_resumes = 0

    for iteration in range(1, spec.get("max_iterations", MAX_ITERATIONS) + 1):
        response = call(spec["system"])

        # Checked before touching response.content — on a refusal it can be empty,
        # and a truncated turn can hold a tool_use with no matching tool_result,
        # which would make the *next* request invalid. Neither is appended.
        message = _stop_message(response.stop_reason)
        if message is not None:
            on_event({"agent": agent, "type": "stopped", "detail": response.stop_reason})
            return done(response.stop_reason, message, iterations=iteration)

        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason == "pause_turn":
            # A server-side tool paused mid-run. Resending resumes it — but cap
            # the resumes so a stuck pause can't spin.
            pause_resumes += 1
            if pause_resumes > 3:
                return finish("too many pause_turn resumes", "unresolved", iteration)
            continue

        if response.stop_reason != "tool_use":
            # Exit 1: the model stopped on its own.
            return done("end_turn", text_of(response), iterations=iteration)

        calls = [block for block in response.content if block.type == "tool_use"]
        gave_up = False
        handed_back = None
        outcomes: dict[str, tuple[str, bool]] = {}

        # Phase 1 — validate everything before running anything. A rejected call
        # never reaches dispatch, and validating up front means a batch can't
        # half-execute before the bad member of it is noticed.
        for block in calls:
            on_event({
                "agent": agent, "type": "tool_call",
                "tool": block.name, "input": block.input,
            })
            errors = validate_tool_call(block.name, block.input, case, schemas)
            if not errors:
                continue

            validation_retries += 1
            give_up = validation_retries > MAX_VALIDATION_RETRIES
            gave_up = gave_up or give_up
            label = "giving up" if give_up else f"retry {validation_retries}/{MAX_VALIDATION_RETRIES}"
            on_event({
                "agent": agent, "type": "rejected",
                "tool": block.name, "errors": errors, "label": label,
            })

            # Either way the tool does NOT run. An exhausted retry budget means
            # "don't", not "do it anyway".
            error_text = "Your tool call was rejected:\n" + "\n".join(f"- {e}" for e in errors)
            error_text += (
                "\nDon't call this tool again — explain the situation instead."
                if give_up
                else "\nFix the input, or choose a different course of action."
            )
            outcomes[block.id] = (error_text, True)

        # Phase 2 — run what survived. When the model asked for several tools in
        # one turn and the spec allows it, they run concurrently: that is the only
        # thing "parallel agents" means once a Task tool is one of these entries.
        # dispatch must be thread-safe for that, which is a real constraint on
        # anything it mutates — the case dict included.
        runnable = [block for block in calls if block.id not in outcomes]
        if spec.get("parallel") and len(runnable) > 1:
            with ThreadPoolExecutor(max_workers=len(runnable)) as pool:
                futures = {
                    block.id: pool.submit(dispatch, block.name, block.input, case)
                    for block in runnable
                }
            outcomes.update({block_id: f.result() for block_id, f in futures.items()})
        else:
            for block in runnable:
                outcomes[block.id] = dispatch(block.name, block.input, case)

        tool_results = []
        for block in calls:
            result, is_error = outcomes[block.id]
            if block.id in {b.id for b in runnable}:
                on_event({
                    "agent": agent, "type": "tool_result", "tool": block.name,
                    "result": result, "is_error": is_error,
                })
            if block.name == spec.get("final_tool") and not is_error:
                # The structured handoff: the agent's answer IS this tool's input.
                handed_back = block.input

            tool_results.append({
                "type": "tool_result", "tool_use_id": block.id,
                "content": result, "is_error": is_error,
            })

        messages.append({"role": "user", "content": tool_results})

        # Exit 2: the agent delivered its structured result. No sign-off — nobody
        # is reading this one's prose.
        if handed_back is not None:
            on_event({"agent": agent, "type": "handoff", "detail": spec["final_tool"]})
            return done("final_tool", text_of(response), handed_back, iteration)

        # Exit 3: something outside the loop says the task is over.
        reason = stop_when(case) if stop_when else None
        if reason:
            return finish(reason, "closed", iteration)

        # Exit 4: we've stopped executing this tool, so leaving the model free to
        # call it again is how you get an infinite retry cycle.
        if gave_up:
            return finish("validation retry budget exhausted", "unresolved", iteration)

    # Exit 5: backstop. Still asking for tools after max_iterations rounds.
    limit = spec.get("max_iterations", MAX_ITERATIONS)
    return finish(f"hit max_iterations={limit}", "unresolved", limit)
