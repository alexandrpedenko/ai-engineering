# ADR-0013 — The agent runtime is chosen per project; Claude Agent SDK is the second one

**Status:** Accepted (2026-10-11)

## Context

ADR-0004 put agent steps behind an `AgentRuntime` port with Cursor as the
first adapter and the Claude Agent SDK named as the likely second. That
second runtime is now needed: the Cursor SDK refuses accounts on the free
plan (`plan_required`, even for local agents), so a team without a paid
Cursor plan can't run any workflow. Teams may also simply prefer Claude.

The two runtimes differ in ways the rest of the orchestrator must not care
about: model ids (`composer-2.5` vs `claude-opus-5-5`), where they look for
skills and agents (`.cursor/…` vs `.claude/…`), how they authenticate
(`CURSOR_API_KEY` vs `ANTHROPIC_API_KEY`), and whether a run can be found
again after the orchestrator's process stops.

## Decision

- `orchestrator.config.json` gains `runtime: "cursor" | "claude"` (default
  `"cursor"`), overridable with `ORCH_RUNTIME`. One runtime per project and
  process; `--fake` / `ORCH_FAKE` still replace it with the fake agent.
- Default models move into a per-runtime map, `models: { cursor:
  "composer-2.5", claude: "claude-opus-5-5" }`. A step's or agent's `model`
  is passed through as written, so it must be an id the chosen runtime
  knows; `validate` doesn't check model ids.
- **One adapter, one strategy per provider.** A single `ProviderAgentRuntime`
  implements the `AgentRuntime` port once: it keeps the API key out of error
  messages, remembers the runs it started in this process (so it can
  reattach to them), turns a run that can't be found or was cut off into the
  "interrupted" result, and wraps provider runs into `RunHandle`s. Each
  provider is a small `AgentProvider` (`open` a run, `find` one again, map
  its messages): `CursorProvider` (the code that was `CursorAgentRuntime`)
  and `ClaudeProvider` on `@anthropic-ai/claude-agent-sdk` (`query()`). A
  factory picks the provider from config; composition keeps one runtime per
  process. Adding a third provider means writing one `AgentProvider`.
- Claude runs with Claude Code's own system prompt (`preset: "claude_code"`)
  and the project's settings (`settingSources: ["project"]`), so ADR-0005
  holds unchanged: required skills and the persona go in the message.
- The project's agent files (`.cursor/agents/*.md`) are passed to Claude as
  programmatic subagents (`agents` option), so they're available whatever
  folder the project uses.
- **No reattach for Claude runs.** The SDK runs Claude Code as a child of our
  process; if our process stops, so does the run, and there's no stored
  result to collect. `attach` therefore reports a known run as interrupted
  (`failed`, retryable), the same as a cut-off Cursor run (ADR-0006). It
  never silently starts a second run.

## Consequences

- Switching runtime is one config line; workflows, prompts, the engine, the
  server and the UI don't change.
- A workflow that names a Cursor model in a step won't run on Claude (and vice
  versa); the agent fails to start, and the step shows the SDK's message
  (the start-failure path from slice 5.5).
- Skills in `.cursor/skills` that a step doesn't list aren't discoverable by
  Claude (it looks in `.claude/skills`). Required skills still reach the agent
  through the message. Loading `.cursor/skills` as a Claude plugin is a
  possible later step.
- The Claude Agent SDK bundles a native Claude Code binary as an optional
  dependency: a larger install.

## Alternatives considered

- **Two runtime classes side by side** (`CursorAgentRuntime`,
  `ClaudeAgentRuntime`). Simple, but the shared rules (key redaction, the
  interrupted result, in-process reattach) would be copied and could drift.
- **Runtime per workflow or per step.** More flexible, but every step's model
  id would have to match its runtime, and validation would need both model
  lists. Per project first; per step later if a team needs it.
- **Claude through the Messages API with our own tools** (Tool Runner). We'd
  have to build file editing, search and shell tools and their safety
  ourselves; the Agent SDK is that harness already.
- **Managed Agents.** Runs in Anthropic's sandbox, not in the host project's
  folder, which is the whole point of the orchestrator (ADR-0001).
