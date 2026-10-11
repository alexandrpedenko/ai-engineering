import { parseWorkflow } from "../domain/parseWorkflow";
import type { Registry } from "../domain/registry";
import { validate, type Problem } from "../domain/validate";
import { InvalidInputError } from "./errors";
import type { WorkflowStore } from "./WorkflowStore";

// Saves a workflow sent from outside under `id`. Refuses a body that isn't a
// workflow or whose id differs from `id`. A workflow with validation errors is
// still saved (it just can't run); its problems are returned.
export async function saveWorkflow(deps: { store: WorkflowStore; registry: Registry }, id: string, body: unknown): Promise<Problem[]> {
  const parsed = parseWorkflow(body);
  if (!parsed.ok) throw new InvalidInputError("not a valid workflow", parsed.problems);
  if (parsed.workflow.id !== id) throw new InvalidInputError(`the workflow's id "${parsed.workflow.id}" doesn't match "${id}"`);

  await deps.store.save(parsed.workflow);
  return validate(parsed.workflow, { registry: deps.registry, phases: await deps.store.phases() });
}
