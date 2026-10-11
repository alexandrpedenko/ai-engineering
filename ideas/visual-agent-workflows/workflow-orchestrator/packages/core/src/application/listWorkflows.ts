import type { Registry } from "../domain/registry";
import { validate, type Problem } from "../domain/validate";
import type { WorkflowStore } from "./WorkflowStore";

// `agents` and `skills`: the names the workflow's steps use, each once.
export type WorkflowSummary = { id: string; name: string; phase?: string; agents: string[]; skills: string[]; problems: Problem[] };

// Every workflow file with what's wrong with it and what it uses. A file that
// can't be read is listed under its id with one error and nothing used.
export async function listWorkflows(deps: { store: WorkflowStore; registry: Registry }): Promise<WorkflowSummary[]> {
  const phases = await deps.store.phases();
  const entries = await deps.store.list();
  return entries.map(({ id, workflow, error }) => {
    if (!workflow) return { id, name: id, agents: [], skills: [], problems: [{ severity: "error", message: error ?? "can't be read" }] };
    const agentSteps = workflow.steps.filter((step) => step.type === "agent");
    const summary: WorkflowSummary = {
      id,
      name: workflow.name,
      agents: [...new Set(agentSteps.map((step) => step.agent))],
      skills: [...new Set(agentSteps.flatMap((step) => step.skills))],
      problems: validate(workflow, { registry: deps.registry, phases }),
    };
    if (workflow.phase) summary.phase = workflow.phase;
    return summary;
  });
}
