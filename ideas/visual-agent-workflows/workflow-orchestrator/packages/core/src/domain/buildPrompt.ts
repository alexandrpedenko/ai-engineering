import { fillTemplate } from "./template";
import type { AgentDef, Skill } from "./registry";
import type { AgentStep } from "./workflow";

export type PromptInput = {
  step: AgentStep;
  agent: AgentDef;
  skills: Skill[]; // the step's skills, in the step's order
  inputs: Record<string, string>;
  feedback: string[]; // reviewer feedback for this step, oldest first
  doNotTouch: string[]; // paths the agent must leave alone
};

// The section headings of a step's message, in order.
export const PROMPT_SECTIONS = {
  role: "# Your role",
  skills: "# Skills to follow",
  task: "# Task",
  read: "# Read first",
  write: "# You must write",
  feedback: "# Reviewer feedback on your previous attempt",
  rules: "# Rules",
} as const;

// The lines of one section of a message built by buildPrompt (without the
// heading), or [] when the message has no such section.
export function promptSection(message: string, heading: string): string[] {
  const lines = message.split("\n");
  const start = lines.indexOf(heading);
  if (start === -1) return [];
  const end = lines.findIndex((line, i) => i > start && line.startsWith("# "));
  return lines.slice(start + 1, end === -1 ? undefined : end).filter((line) => line.trim() !== "");
}

const list = (items: string[]) => items.map((item) => `- ${item}`).join("\n");

// The message an agent step sends: role, skills, task, files to read and
// write, reviewer feedback, rules. A section with nothing in it is left out.
export function buildPrompt(input: PromptInput): string {
  const sections: string[] = [];
  if (input.agent.body) sections.push(`${PROMPT_SECTIONS.role}\n${input.agent.body}`);
  if (input.skills.length > 0) {
    sections.push(`${PROMPT_SECTIONS.skills}\n${input.skills.map((s) => `## ${s.name}\n${s.body}`).join("\n\n")}`);
  }
  sections.push(`${PROMPT_SECTIONS.task}\n${fillTemplate(input.step.instructions, input.inputs).trim()}`);
  if (input.step.reads.length > 0) sections.push(`${PROMPT_SECTIONS.read}\n${list(input.step.reads)}`);
  if (input.step.writes.length > 0) sections.push(`${PROMPT_SECTIONS.write}\n${list(input.step.writes)}`);
  if (input.feedback.length > 0) {
    const numbered = input.feedback.map((text, i) => `${i + 1}. ${text}`).join("\n");
    sections.push(`${PROMPT_SECTIONS.feedback}\n${numbered}`);
  }
  const rules: string[] = [];
  if (input.step.writes.length === 0) rules.push("Write your results where the skills above and the project's rules say.");
  if (input.doNotTouch.length > 0) rules.push(`Do not change anything in: ${input.doNotTouch.join(", ")}`);
  if (rules.length > 0) sections.push(`${PROMPT_SECTIONS.rules}\n${list(rules)}`);
  return `${sections.join("\n\n")}\n`;
}

// The model for a step: the step's own, else the agent's (unless "inherit"),
// else the default.
export function resolveModel(step: AgentStep, agent: AgentDef, defaultModel: { id: string }): { id: string } {
  if (step.model) return { id: step.model };
  if (agent.model && agent.model !== "inherit") return { id: agent.model };
  return defaultModel;
}
