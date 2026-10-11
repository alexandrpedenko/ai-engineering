import type { Registry } from "../../src/domain/registry";
import { Workflow } from "../../src/domain/workflow";

// The registry of a small host: a BA and an architect, two skills.
export const registry: Registry = {
  root: "/host",
  skills: [
    { name: "requirements-elicitation", path: ".cursor/skills/requirements-elicitation/SKILL.md", description: "d", body: "Number every requirement." },
    { name: "architecture-review", path: ".agents/skills/architecture-review/SKILL.md", description: "d", body: "Name the risks." },
  ],
  agents: [
    { name: "business-analyst", path: ".cursor/agents/business-analyst.md", description: "d", body: "You are a business analyst." },
    { name: "architect", path: ".cursor/agents/architect.md", description: "d", model: "inherit", body: "You are the architect." },
  ],
  artefacts: [],
  warnings: [],
};

// The workflow file as written on disk (before defaults), so tests can change
// one field and parse it.
export function baWorkflowJson() {
  return {
    schema: 1,
    id: "ba-discovery",
    name: "BA discovery",
    phase: "discovery",
    inputs: [{ id: "focus", label: "What to focus on", type: "text" }],
    steps: [
      {
        id: "elicit",
        type: "agent",
        label: "Write requirements",
        agent: "business-analyst",
        skills: ["requirements-elicitation"],
        instructions: "Turn discovery/brief.md into requirements. Focus: {{inputs.focus}}",
        reads: ["discovery/brief.md"],
        writes: ["discovery/requirements.md"],
      },
      { id: "review", type: "gate", label: "Review requirements", shows: ["discovery/requirements.md"], onReject: "elicit" },
      {
        id: "design",
        type: "agent",
        label: "Sketch the design",
        agent: "architect",
        skills: ["architecture-review"],
        instructions: "Sketch a design for discovery/requirements.md.",
        reads: ["discovery/requirements.md"],
        writes: ["discovery/design.md"],
      },
    ],
    edges: [
      { from: "elicit", to: "review" },
      { from: "review", to: "design" },
    ],
  };
}

export const baWorkflow = (change: (json: ReturnType<typeof baWorkflowJson>) => void = () => {}): Workflow => {
  const json = baWorkflowJson();
  change(json);
  return Workflow.parse(json);
};
