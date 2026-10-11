import type { AgentStep, GateStep, Step, Workflow, WorkflowInput } from "@orch/core";
import { NODE_SPACING, positionOf, stepIdProblem } from "./workflowGraph";

// Edits to a workflow draft. Each takes a workflow and returns a new one; the
// input is never changed. None of them checks whether the result is valid:
// that is the server's validator's job.

export type AgentStepFields = Omit<AgentStep, "id" | "type">;
export type GateFields = Omit<GateStep, "id" | "type">;
export type WorkflowFieldsPatch = Partial<{ name: string; inputs: WorkflowInput[]; phase: string | null }>;
export type RenameResult = { ok: true; workflow: Workflow } | { ok: false; problem: string };

// A workflow id made from a name: "UX flows" → "ux-flows". Accents are
// dropped, anything else that isn't a letter or digit becomes a dash, and an
// id that would not start with a letter gets "workflow-" in front.
export function idFromName(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug === "") return "workflow";
  return /^[a-z]/.test(slug) ? slug : `workflow-${slug}`;
}

// The first of "<prefix>-1", "<prefix>-2", … not in `taken`.
function firstFree(prefix: string, taken: string[]): string {
  let n = 1;
  while (taken.includes(`${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
}

// The first of "<prefix>-1", "<prefix>-2", … that no step uses.
export function freeStepId(workflow: Workflow, prefix: "step" | "gate"): string {
  return firstFree(prefix, workflow.steps.map((step) => step.id));
}

function blankAgentStep(id: string): AgentStep {
  return { id, type: "agent", label: "New step", agent: "", skills: [], instructions: "", reads: [], writes: [], model: null };
}

// A workflow with one empty agent step, ready to be filled in.
export function newWorkflow(options: { id: string; name: string; phase: string | null }): Workflow {
  const workflow: Workflow = {
    schema: 1,
    id: options.id,
    name: options.name,
    inputs: [],
    steps: [blankAgentStep("step-1")],
    edges: [],
    layout: { "step-1": { x: 0, y: 0 } },
  };
  return options.phase ? { ...workflow, phase: options.phase } : workflow;
}

// Adds an empty step of the type to the right of the rightmost node (saved
// position or not). A new gate sends rejections to the last agent step in the
// list (or to itself when there is none, which the validator reports).
// Returns the new step's id too.
export function addStep(workflow: Workflow, type: "agent" | "gate"): { workflow: Workflow; stepId: string } {
  const positions = workflow.steps.map((step) => positionOf(workflow, step.id));
  const rightmost = positions.reduce<{ x: number; y: number } | null>((best, p) => (best === null || p.x > best.x ? p : best), null);
  const position = rightmost ? { x: rightmost.x + NODE_SPACING, y: rightmost.y } : { x: 0, y: 0 };

  let step: Step;
  if (type === "agent") {
    step = blankAgentStep(freeStepId(workflow, "step"));
  } else {
    const id = freeStepId(workflow, "gate");
    const lastAgent = workflow.steps.filter((s) => s.type === "agent").at(-1);
    step = { id, type: "gate", label: "Review", shows: [], onReject: lastAgent?.id ?? id, maxRevisions: 3 };
  }
  return {
    workflow: { ...workflow, steps: [...workflow.steps, step], layout: { ...workflow.layout, [step.id]: position } },
    stepId: step.id,
  };
}

// Removes a step, its edges and its position. A gate that sent rejections to
// it keeps pointing at the missing id, so the validator asks for a new target.
export function removeStep(workflow: Workflow, stepId: string): Workflow {
  const { [stepId]: _, ...layout } = workflow.layout;
  return {
    ...workflow,
    steps: workflow.steps.filter((step) => step.id !== stepId),
    edges: workflow.edges.filter((edge) => edge.from !== stepId && edge.to !== stepId),
    layout,
  };
}

// Gives a step a new id and follows it everywhere the old one was used: edges,
// gates' onReject and the layout. Refuses an id of the wrong shape or one
// another step already has.
export function renameStep(workflow: Workflow, from: string, to: string): RenameResult {
  if (from === to) return { ok: true, workflow };
  const problem = stepIdProblem(workflow, to, from);
  if (problem) return { ok: false, problem };

  const rename = (id: string) => (id === from ? to : id);
  const layout: Workflow["layout"] = {};
  for (const [id, position] of Object.entries(workflow.layout)) layout[rename(id)] = position;
  return {
    ok: true,
    workflow: {
      ...workflow,
      steps: workflow.steps.map((step) =>
        step.type === "gate" ? { ...step, id: rename(step.id), onReject: rename(step.onReject) } : { ...step, id: rename(step.id) },
      ),
      edges: workflow.edges.map((edge) => ({ from: rename(edge.from), to: rename(edge.to) })),
      layout,
    },
  };
}

// Makes `to` the step after `from`, replacing any step that came next before.
// A step can't lead to itself.
export function connect(workflow: Workflow, from: string, to: string): Workflow {
  if (from === to) return workflow;
  return { ...workflow, edges: [...workflow.edges.filter((edge) => edge.from !== from), { from, to }] };
}

// Removes the edge leaving `from`, so it becomes the last step of its path.
export function disconnect(workflow: Workflow, from: string): Workflow {
  return { ...workflow, edges: workflow.edges.filter((edge) => edge.from !== from) };
}

export function moveStep(workflow: Workflow, stepId: string, position: { x: number; y: number }): Workflow {
  return { ...workflow, layout: { ...workflow.layout, [stepId]: { x: position.x, y: position.y } } };
}

// Changes fields of an agent step. Does nothing when `stepId` is not an agent step.
export function updateAgentStep(workflow: Workflow, stepId: string, patch: Partial<AgentStepFields>): Workflow {
  return { ...workflow, steps: workflow.steps.map((step) => (step.id === stepId && step.type === "agent" ? { ...step, ...patch } : step)) };
}

// Changes fields of a gate. Does nothing when `stepId` is not a gate.
export function updateGate(workflow: Workflow, stepId: string, patch: Partial<GateFields>): Workflow {
  return { ...workflow, steps: workflow.steps.map((step) => (step.id === stepId && step.type === "gate" ? { ...step, ...patch } : step)) };
}

// Changes the workflow's own fields. A null phase removes it (the workflow
// then shows under Unsorted).
export function updateWorkflow(workflow: Workflow, patch: WorkflowFieldsPatch): Workflow {
  const { phase, ...rest } = patch;
  const next: Workflow = { ...workflow, ...rest };
  if (phase === undefined) return next;
  if (phase === null) {
    const { phase: _, ...withoutPhase } = next;
    return withoutPhase;
  }
  return { ...next, phase };
}

// Adds a text input named "input-1", "input-2", … (the first unused), not required.
export function addInput(workflow: Workflow): Workflow {
  const input: WorkflowInput = { id: firstFree("input", workflow.inputs.map((i) => i.id)), label: "", type: "text", required: false };
  return { ...workflow, inputs: [...workflow.inputs, input] };
}

export function updateInput(workflow: Workflow, index: number, patch: Partial<Omit<WorkflowInput, "type">>): Workflow {
  return { ...workflow, inputs: workflow.inputs.map((input, i) => (i === index ? { ...input, ...patch } : input)) };
}

export function removeInput(workflow: Workflow, index: number): Workflow {
  return { ...workflow, inputs: workflow.inputs.filter((_, i) => i !== index) };
}
