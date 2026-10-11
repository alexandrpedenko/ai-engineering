import type { Phase } from "./phase";
import type { Registry } from "./registry";
import { templateRefs } from "./template";
import type { Edge, Step, Workflow } from "./workflow";

// Something wrong with a workflow. A workflow with any error can be saved but
// not run; warnings are shown and don't stop it.
export type Problem = { severity: "error" | "warning"; stepId?: string; message: string };

export type ValidationContext = {
  registry: Pick<Registry, "skills" | "agents">;
  phases: Phase[];
};

export function hasErrors(problems: Problem[]): boolean {
  return problems.some((p) => p.severity === "error");
}

// The ids reachable from `from` by following `next` links, `from` excluded.
function reachable(from: string, next: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const queue = [...(next.get(from) ?? [])];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...(next.get(id) ?? []));
  }
  return seen;
}

// One step on each cycle found by a depth-first walk (the step an edge loops back to).
function stepsOnCycles(ids: string[], next: Map<string, string[]>): string[] {
  const state = new Map<string, "visiting" | "done">();
  const found: string[] = [];
  const visit = (id: string) => {
    state.set(id, "visiting");
    for (const to of next.get(id) ?? []) {
      if (state.get(to) === "visiting") found.push(to);
      else if (!state.has(to)) visit(to);
    }
    state.set(id, "done");
  };
  for (const id of ids) if (!state.has(id)) visit(id);
  return [...new Set(found)];
}

function links(edges: Edge[], key: "from" | "to"): Map<string, string[]> {
  const other = key === "from" ? "to" : "from";
  const map = new Map<string, string[]>();
  for (const edge of edges) map.set(edge[key], [...(map.get(edge[key]) ?? []), edge[other]]);
  return map;
}

// Everything that would stop the workflow from running as drawn, plus
// warnings. Checks names against the registry and the phases; reads no files.
export function validate(workflow: Workflow, context: ValidationContext): Problem[] {
  const problems: Problem[] = [];
  const error = (message: string, stepId?: string) =>
    problems.push(stepId ? { severity: "error", stepId, message } : { severity: "error", message });
  const warning = (message: string, stepId?: string) =>
    problems.push(stepId ? { severity: "warning", stepId, message } : { severity: "warning", message });

  const steps = new Map<string, Step>();
  for (const step of workflow.steps) {
    if (steps.has(step.id)) error(`two steps have the id "${step.id}"`, step.id);
    else steps.set(step.id, step);
  }

  const agents = new Set(context.registry.agents.map((a) => a.name));
  const skills = new Set(context.registry.skills.map((s) => s.name));
  const inputs = new Set(workflow.inputs.map((i) => i.id));
  for (const step of steps.values()) {
    if (step.type !== "agent") continue;
    if (!agents.has(step.agent)) error(`unknown agent "${step.agent}"`, step.id);
    for (const skill of step.skills) if (!skills.has(skill)) error(`unknown skill "${skill}"`, step.id);
    for (const ref of templateRefs(step.instructions)) {
      if (!inputs.has(ref)) error(`instructions use {{inputs.${ref}}}, but the workflow has no input "${ref}"`, step.id);
    }
  }

  const edges: Edge[] = [];
  for (const edge of workflow.edges) {
    const missing = [edge.from, edge.to].find((id) => !steps.has(id));
    if (missing) error(`edge ${edge.from} → ${edge.to} points to a missing step "${missing}"`);
    else edges.push(edge);
  }
  const next = links(edges, "from");
  const previous = links(edges, "to");
  const ids = [...steps.keys()];

  const starts = ids.filter((id) => !previous.has(id));
  if (starts.length === 0) error("no start step: every step has an incoming edge");
  if (starts.length > 1) {
    for (const id of starts) error(`"${id}" is one of ${starts.length} start steps; connect them into one line`, id);
  }

  for (const [id, targets] of next) {
    if (targets.length > 1) error(`"${id}" has ${targets.length} next steps; branching isn't supported yet`, id);
  }

  for (const id of stepsOnCycles(ids, next)) {
    error(`"${id}" is on a loop of edges; loops go through a gate's onReject instead`, id);
  }

  const [start] = starts;
  if (starts.length === 1 && start) {
    const fromStart = reachable(start, next);
    for (const id of ids) {
      if (id !== start && !fromStart.has(id)) error(`"${id}" can't be reached from the start step "${start}"`, id);
    }
  }

  for (const step of steps.values()) {
    if (step.type !== "gate") continue;
    const target = steps.get(step.onReject);
    if (!target) error(`"${step.id}" sends rejections to "${step.onReject}", which doesn't exist`, step.id);
    else if (target.type !== "agent") {
      error(`"${step.id}" sends rejections to "${step.onReject}", which is not an agent step`, step.id);
    } else if (!reachable(step.id, previous).has(step.onReject)) {
      error(`"${step.id}" sends rejections to "${step.onReject}", which isn't before it`, step.id);
    }
  }

  for (const step of steps.values()) {
    if (step.type === "agent" && step.writes.length === 0) {
      warning(`"${step.id}" writes no files, so its result can't be checked`, step.id);
    }
  }

  if (!workflow.phase) warning("no phase; the workflow is shown under Unsorted");
  else if (!context.phases.some((p) => p.id === workflow.phase)) {
    warning(`phase "${workflow.phase}" is not in phases.json; the workflow is shown under Unsorted`);
  }

  return problems;
}
