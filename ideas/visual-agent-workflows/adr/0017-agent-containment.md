# ADR-0017 — What an agent may touch is enforced in code, not only asked for

**Status:** Accepted (2026-10-12). Found in the slice 9 security review.

## Context

Agents read files written by other people (briefs, wiki pages, skills), so a
file can carry instructions the person never gave ("prompt injection"). Until
now the only limits were: Claude has no Bash; every prompt says "don't touch
the orchestrator folder". Cursor agents had the full default toolset,
including a shell. A Claude agent could edit the orchestrator's own source
(which `tsx watch` then runs), `.claude/settings.json` (hooks run on the next
step), or read `workflow-orchestrator/.env`.

## Decision

- **Cursor:** agents get only `read`, `edit`, `delete`, `grep`, `glob`, `ls`.
  No shell, MCP, web or subagents.
- **Claude:** allowed tools stay (Read, Write, Edit, Glob, Grep, Skill, Task);
  Bash, WebFetch and WebSearch are refused. A `PreToolUse` hook refuses any
  file tool on a path outside the project, a **protected path**, or a
  credential file (the `canOpen` denylist). Protected: the orchestrator
  folder (when inside the project), `.git/`, and the files that configure the
  agents themselves (`.claude/settings*.json`, `.claude/hooks/`, `.mcp.json`,
  `.cursor/mcp.json`, `.cursor/hooks*`, `.cursor/cli.json`,
  `.cursor/environment.json`). Skills, agents and workflows stay editable:
  steps may be asked to write them.
- **Every runtime:** after a step, a change under a protected path fails the
  step, so a runtime without hooks (Cursor) is still caught, after the fact.
- The Claude subprocess gets an allow-listed environment.
- `maxTurns`, `maxBudgetUsd` (Claude) and a step timeout (all runtimes) come
  from the config's `limits`.

## Consequences

- An injected instruction can still make an agent edit or delete project
  files it was not asked to touch; the gate shows those changes.
- The project's own `.claude` / `.cursor` settings (hooks, MCP servers) still
  apply, as they do when the team opens the repository in those tools. An
  untrusted repository should not be run.
- After-the-fact detection means a Cursor agent's write to a protected path
  has happened; the step fails and the gate is never reached.
- Keeping the orchestrator folder outside the project root removes the
  largest risk entirely; the README recommends it for untrusted content.
