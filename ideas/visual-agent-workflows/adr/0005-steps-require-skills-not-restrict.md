# ADR-0005 — A step names the skills it requires; it cannot hide the others

**Status:** Accepted (2026-10-11)

## Context

The idea was "each workflow step says which agent and skills it uses". The
SDK doesn't work per step: with `settingSources: ["project"]` a local agent
loads every skill, rule and subagent under the project's `.cursor/`, and the
agent itself decides which skill is relevant and whether to spawn a
subagent. There is no option to say "use exactly these skills". The other
setting, `settingSources: []`, drops the project's rules too, which teams
rely on.

## Decision

- An agent step's `skills` list means **required**, not **allowed**. The
  orchestrator puts the full text of each required skill into the message,
  under a heading that says to follow it. The agent can still use any other
  project skill.
- The step's `agent` persona is not passed as `systemPrompt` (that replaces
  Cursor's built-in system prompt; see Alternatives). Its body goes first in
  the message, inside a clearly marked "Your role" block.
- The message is built by `core/prompt` in a fixed order: persona, required
  skills, the step's `instructions` (with `{{inputs.x}}` filled in), the
  files to read, the files it must write, reviewer feedback from earlier
  rejections, and a closing line to stay out of `workflow-orchestrator/`.
- Anything that must happen every time is its own step, not a subagent we
  hope the agent calls.

## Consequences

- Two steps with different personas still see the same project; the
  difference is in what they're told to do. That matches how the same
  project is used in the Cursor app.
- Long skills make long messages. Token use per step is shown in the run
  view (slice 5) so this is visible.
- The prompt builder is plain code with tests: given a step and a registry,
  the message is exact.

## Alternatives considered

- **A temporary workspace per step holding only the chosen skills.** True
  restriction, but the agent then edits a copy of the project and the
  changes have to be copied back. Revisit with worktrees (post-MVP).
- **`settingSources: []` and inline everything.** Loses project rules and
  MCP config; the agent behaves differently than in Cursor.
- **Persona as `systemPrompt`.** `systemPrompt` *replaces* Cursor's
  built-in system prompt; it cannot be appended to. Gains: the persona has
  the highest priority and can't be diluted by long skills in the message.
  Losses: the built-in prompt is what teaches the agent how to use its
  tools, edit files, follow `.cursor/rules` and pick skills, so we would
  have to write and maintain a full coding-agent prompt ourselves, and the
  agent would behave differently from the same agent in the Cursor app. It
  is also local-only in the SDK, so a cloud runtime couldn't use it.
  Rejected for the MVP.
- **Persona via Cursor's own subagent.** The persona file already *is* a
  Cursor subagent (`.cursor/agents/<name>.md`), and Cursor gives a
  subagent's body to that subagent as its instructions. The step's message
  could say "delegate this to the `business-analyst` subagent". That keeps
  Cursor's built-in prompt and uses the persona the way Cursor intends, but
  whether the delegation happens is up to the model, and the work runs one
  level deeper (less visible in the event stream). Slice 3 compares it with
  the prepended persona on the fixture: same step, both ways, outputs and
  token use side by side.
