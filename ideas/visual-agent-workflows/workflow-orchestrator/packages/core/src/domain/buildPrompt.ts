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

const list = (items: string[]) => items.map((item) => `- ${item}`).join("\n");

// The message an agent step sends: role, skills, task, files to read and
// write, reviewer feedback, rules. A section with nothing in it is left out.
export function buildPrompt(input: PromptInput): string {
  const sections: string[] = [];
  if (input.agent.body) sections.push(`# Your role\n${input.agent.body}`);
  if (input.skills.length > 0) {
    sections.push(`# Skills to follow\n${input.skills.map((s) => `## ${s.name}\n${s.body}`).join("\n\n")}`);
  }
  sections.push(`# Task\n${fillTemplate(input.step.instructions, input.inputs).trim()}`);
  if (input.step.reads.length > 0) sections.push(`# Read first\n${list(input.step.reads)}`);
  if (input.step.writes.length > 0) sections.push(`# You must write\n${list(input.step.writes)}`);
  if (input.feedback.length > 0) {
    const numbered = input.feedback.map((text, i) => `${i + 1}. ${text}`).join("\n");
    sections.push(`# Reviewer feedback on your previous attempt\n${numbered}`);
  }
  if (input.doNotTouch.length > 0) sections.push(`# Rules\n- Do not change anything in: ${input.doNotTouch.join(", ")}`);
  return `${sections.join("\n\n")}\n`;
}

// The model for a step: the step's own, else the agent's (unless "inherit"),
// else the default.
export function resolveModel(step: AgentStep, agent: AgentDef, defaultModel: { id: string }): { id: string } {
  if (step.model) return { id: step.model };
  if (agent.model && agent.model !== "inherit") return { id: agent.model };
  return defaultModel;
}
