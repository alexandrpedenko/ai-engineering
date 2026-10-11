---
title: Prompts
area: prompts
summary: How an agent step, its agent, its skills, the run's inputs and reviewer feedback become the message an agent receives.
code:
  - packages/core/src/domain/buildPrompt.ts
depends_on: [project-registry, workflows]
used_by: [agent-steps]
adrs: [5]
specs: [2-schema-compile, 5-shell-and-runs]
updated: 2026-10-11
---

# Prompts

**What it answers:** what exactly does the agent get told?

`buildPrompt({ step, agent, skills, inputs, feedback, doNotTouch })` returns
one markdown message. Sections, in this order, each left out when empty:

```
# Your role                                       the agent file's body (the persona)
# Skills to follow                                each required skill's body, under "## <name>"
# Task                                            the step's instructions, {{inputs.x}} filled
# Read first                                      step.reads
# You must write                                  step.writes
# Reviewer feedback on your previous attempt      numbered, oldest first
# Rules                                           with no step.writes: "Write your results where the skills
                                                  above and the project's rules say."; then
                                                  "Do not change anything in: workflow-orchestrator/"
```

The headings are exported as `PROMPT_SECTIONS`; `promptSection(message,
heading)` reads one section back (the fake agent uses it to know what to
write).

## Why it's built this way (ADR-0005)

- **Skills are required, not exclusive.** Cursor loads all of the project's
  skills itself (`settingSources: ["project"]`); a step can't hide the others.
  Putting a skill's text in the message makes sure the agent follows it.
- **The persona goes in the message, not `systemPrompt`.** `systemPrompt`
  would replace Cursor's own system prompt, which teaches the agent its tools
  and the project's rules.

## Model

`resolveModel(step, agent, defaultModel)`: the step's `model`, else the
agent's (unless `inherit`), else the config's `defaultModel`.

## Tests

`core/tests/domain/buildPrompt.test.ts` has the full expected message for one
step; change it there first when the format changes.
