# ADR-0004 — Agent steps go through an `AgentRuntime` port; Cursor local first

**Status:** Proposed (2026-10-11)

## Context

`@cursor/sdk` is the first way to run a step. It is young (public beta in
April 2026, 1.0.x now) and the docs warn that tool-call payloads may change.
The Claude Agent SDK has the same concepts (skills, subagents, hooks, MCP)
and is a likely second runtime. Tests must not spend money or need a key.

## Decision

- `core/runtime` defines `AgentRuntime` / `RunHandle` / `StepEvent` (spec,
  Contracts). Only adapters import an agent SDK.
- `CursorRuntime` uses the **local** runtime only:
  `Agent.create({ model, local: { cwd: hostRoot, settingSources: ["project"] } })`,
  then `agent.send(message, { idempotencyKey })`. It maps `SDKMessage` to
  `StepEvent` using only the stable envelope fields (`type`, `call_id`,
  `name`, `status`).
- `FakeRuntime` replays a script of events and file writes. Every test of
  `compile`, the server and the run manager uses it. **No test calls Cursor.**
- Steps run one at a time in the MVP. Two local agents in the same working
  tree would edit the same files.

## Consequences

- Cloud agents (PRs, artifacts, survive a closed laptop) are a second
  adapter later; they need the host to be a pushed git repo.
- Slice 3 has one manual check against the real SDK; it is not in `npm test`.
- `customTools` (local only in the SDK) could later give the agent tools such
  as "mark output ready". Not in the MVP.

## Alternatives considered

- **Call the SDK straight from graph nodes.** Fastest to write; makes every
  test need the SDK and couples the engine to one vendor's event shapes.
- **Cloud runtime first.** Better isolation, but needs a remote repo and
  makes the demo depend on pushing the host project.
