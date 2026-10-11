import type { Registry } from "../domain/registry";
import { validate, type Problem } from "../domain/validate";
import type { WorkflowStore } from "./WorkflowStore";

export type WorkflowSummary = { id: string; name: string; phase?: string; problems: Problem[] };

// Every workflow file with what's wrong with it. A file that can't be read is
// listed under its id with one error.
export async function listWorkflows(deps: { store: WorkflowStore; registry: Registry }): Promise<WorkflowSummary[]> {
  const phases = await deps.store.phases();
  const entries = await deps.store.list();
  return entries.map(({ id, workflow, error }) => {
    if (!workflow) return { id, name: id, problems: [{ severity: "error", message: error ?? "can't be read" }] };
    const summary: WorkflowSummary = { id, name: workflow.name, problems: validate(workflow, { registry: deps.registry, phases }) };
    if (workflow.phase) summary.phase = workflow.phase;
    return summary;
  });
}
