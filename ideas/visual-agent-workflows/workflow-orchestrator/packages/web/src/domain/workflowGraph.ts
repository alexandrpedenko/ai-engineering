import type { AgentStep, Step, Workflow } from "@orch/core";

// Questions about a workflow's shape. These read only; edits are in workflowEdits.

// The rule for step and workflow ids, the same as core's StepId: lowercase
// letters, digits and dashes, starting with a letter.
export const STEP_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const ID_RULE = "use lowercase letters, digits and dashes, starting with a letter";

// Horizontal distance between two nodes placed side by side.
export const NODE_SPACING = 280;

export function findStep(workflow: Workflow, id: string): Step | undefined {
  return workflow.steps.find((step) => step.id === id);
}

// Where a step is drawn: its saved position, or else in a row by its place in
// the file.
export function positionOf(workflow: Workflow, stepId: string): { x: number; y: number } {
  const saved = workflow.layout[stepId];
  if (saved) return saved;
  const index = workflow.steps.findIndex((step) => step.id === stepId);
  return { x: Math.max(index, 0) * NODE_SPACING, y: 0 };
}

// The step an edge leads to from `id`, or null when there is none.
export function nextStep(workflow: Workflow, id: string): string | null {
  return workflow.edges.find((edge) => edge.from === id)?.to ?? null;
}

// The agent steps a gate can send rejections to: those with a path of edges
// leading to the gate, nearest first.
export function agentStepsBefore(workflow: Workflow, gateId: string): AgentStep[] {
  const found: AgentStep[] = [];
  const seen = new Set<string>([gateId]);
  let frontier = [gateId];
  while (frontier.length > 0) {
    const previous = workflow.edges.filter((edge) => frontier.includes(edge.to) && !seen.has(edge.from)).map((edge) => edge.from);
    for (const id of previous) {
      seen.add(id);
      const step = findStep(workflow, id);
      if (step?.type === "agent") found.push(step);
    }
    frontier = previous;
  }
  return found;
}

// Why `id` can't name a step (wrong shape, or used by a step other than
// `current`), or null when it can.
export function stepIdProblem(workflow: Workflow, id: string, current?: string): string | null {
  if (!STEP_ID_PATTERN.test(id)) return ID_RULE;
  if (id !== current && workflow.steps.some((step) => step.id === id)) return `"${id}" is already used by another step`;
  return null;
}

// Why `id` can't name a new workflow (wrong shape, or taken), or null when it can.
export function workflowIdProblem(id: string, takenIds: string[]): string | null {
  if (!STEP_ID_PATTERN.test(id)) return ID_RULE;
  if (takenIds.includes(id)) return `a workflow "${id}" already exists`;
  return null;
}
