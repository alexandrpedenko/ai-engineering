# Project 3 — Travel concierge with memory (`deepagents`)

## Domain and business goal

A concierge you come back to. Across separate sessions it remembers who you
are (vegetarian, hates early flights, always wants a gym, budget-conscious but
splurges on food), keeps a dossier per trip, does open-ended research when
asked ("compare three neighbourhoods in Porto for a 4-night stay"), and
delegates the grunt work to sub-agents while keeping its own context small.

It builds on projects 1 and 2: the hotel tools and policy retriever are its
tools; the itinerary graph can be one of them. What's new is everything around
the agent — planning, files, sub-agents, memory across threads, and staying
useful over a long, messy conversation.

Business goal: a returning user shouldn't have to restate preferences; a long
research task shouldn't blow up the context or lose track of what it was doing.

## What the `deepagents` API should cover

1. **`create_deep_agent` out of the box** — same tools as project 1, no extra
   config. See what comes for free: the planning tool (`write_todos`), the
   filesystem tools (`ls`, `read_file`, `write_file`, `edit_file`), the
   built-in system prompt. Compare a run with `create_agent` on the same
   multi-step request and look at the traces side by side.
2. **Planning** — watch the todo list get written and updated on a
   multi-step brief. Show a case where the plan is wrong and how the agent
   revises it.
3. **Virtual filesystem** — the agent saves research notes and the trip dossier
   to files instead of keeping them in the message history. Backends: in-state
   (default) → local directory (`FilesystemBackend`) so the dossier survives on
   disk and you can open it.
4. **Sub-agents** — define `hotel_researcher` and `neighbourhood_researcher`
   sub-agents with their own prompts and narrower tool sets; the main agent
   delegates via the `task` tool. Point of the exercise: the sub-agent's long
   tool trace never enters the parent's context, only its summary does.
5. **Long-term memory** — the headline feature. `StoreBackend` /
   `CompositeBackend` so a `/memories/` path is backed by a LangGraph store
   and persists across `thread_id`s. Session 1: user mentions they're
   vegetarian and hate early flights. Session 2, new thread: the agent
   already knows. Show what the memory file looks like and how the agent
   decides what to write there (a memory-instructions section in the prompt).
6. **Context compression** — `SummarizationMiddleware` kicking in during a
   long research session; the agent keeps working after the history is
   summarised, and the files on disk are what make that safe.
7. **Human-in-the-loop** — `interrupt_on` for `make_reservation`, same idea as
   project 1 but through the deep-agent config.
8. **RAG inside a sub-agent** — the policy retriever from project 1 lives only
   in a `policy_expert` sub-agent, so the main agent never sees raw chunks.
   It opens project 1's persisted `Chroma` index at `data/chroma/` directly
   (`hotelbot.index.get_policy_index`) rather than re-embedding the policy
   docs for this project — the payoff of persisting the index in the first
   place.
9. **Custom middleware / skills** — one small addition, e.g. a middleware that
   stamps the current date, or a skill file (`SKILL.md`-style) the agent loads
   for "how to write a trip dossier".
10. **Guardrails for delegating agents** — the injection from project 1
    revisited: the poisoned policy doc is now read by the `policy_expert`
    sub-agent. Does the injection reach the parent? Sub-agent isolation and
    narrow tool sets as the mitigation; a sub-agent that can read but never
    book. Same idea as the shop-assistant hooks, expressed in deep-agent
    config.
11. **Cost of a deep agent** — where the tokens go on a long session: parent
    vs each sub-agent, before vs after summarisation, with vs without the
    filesystem (notes in files instead of in messages). The number that
    justifies the architecture.
12. **Online evaluation** — the P2 evals were offline, on a dataset. Here:
    feedback attached to real runs (thumbs on a dossier), an annotation queue,
    and an LLM-judge running on a sample of live traces. Optionally LangSmith
    Engine on the project's traces to see what it flags.
13. **LangSmith for long-running agents** — trace a multi-session run, find
    the summarisation event, the sub-agent boundaries, and the memory writes
    in the trace.

## Rough notebook outline

- `01_deep_agent_out_of_the_box.ipynb` — `create_deep_agent` with project 1
  tools; planning and filesystem tools in action; compare with `create_agent`.
- `02_files_and_subagents.ipynb` — local filesystem backend, two research
  sub-agents, the dossier written to disk.
- `03_long_term_memory.ipynb` — SQLite-store-backed `/memories/`, two sessions
  on different threads, restart the kernel between them, inspect the memory
  file; then constrain the memory schema once it gets messy.
- `04_long_sessions.ipynb` — summarisation middleware, interrupts on booking,
  policy RAG in a sub-agent, the injection revisited.
- `05_cost_and_online_evals.ipynb` — token breakdown parent vs sub-agents;
  feedback, annotation queue, judge on live traces.

A `concierge/` package holds sub-agent definitions, prompts, backend setup.

## Decisions

- Memory writes start unconstrained; a fixed schema (preferences / facts /
  past trips) is introduced once the free-form file gets messy — that failure
  is part of the lesson.
- Long-term memory store is SQLite-backed so "come back tomorrow" survives a
  kernel restart; keep the store logic small.
- Stay in the travel domain; `hotelbot` tools and data are shared across all
  three projects.
