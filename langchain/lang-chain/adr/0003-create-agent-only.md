# ADR-0003 — One manual loop, then `create_agent` only

**Status:** Accepted (2026-09-13)

## Context

LangChain has had several agent APIs (`AgentExecutor`, LCEL chains with
`bind_tools`, `create_react_agent` in LangGraph prebuilt, `create_agent` in
LangChain 1.x). Docs and blog posts mix them. The shop-assistant project
already built the tool loop by hand against the Anthropic SDK.

## Decision

Book 2 writes the tool loop out once — `bind_tools`, read `tool_calls`, run
the tool, append a `ToolMessage`, call again — so `create_agent` is not magic.
From book 3 on, `create_agent` is the only agent constructor used. No
`AgentExecutor`, no LCEL `|` chains for agent logic, no `create_react_agent`.

## Consequences

- One mental model: agent = model + tools + middleware + checkpointer.
- Anything that needs to hook the loop is expressed as middleware (book 5),
  which is the mechanism project 3's Deep Agents also use.
- Older tutorials won't map one-to-one; that is accepted.
- LCEL and `Runnable` are still used where they're the natural thing — a
  retriever, a text splitter — just not to build agents.

## Alternatives considered

- **Start with `create_agent` directly.** Faster, but the loop's shape is the
  thing that makes middleware hooks understandable later.
- **Build on LangGraph prebuilt.** That is project 2's job.
