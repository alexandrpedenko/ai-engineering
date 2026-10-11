import { parseWorkflow } from "../domain/parseWorkflow";
import type { Registry } from "../domain/registry";
import { validate, type Problem } from "../domain/validate";
import { InvalidInputError } from "./errors";
import type { WorkflowStore } from "./WorkflowStore";

// Saves a new workflow sent from outside. Refuses a body that isn't a workflow;
// the store refuses an id that already has a file (even an unreadable one),
// so creating never overwrites. Returns the new workflow's problems.
export async function createWorkflow(deps: { store: WorkflowStore; registry: Registry }, body: unknown): Promise<Problem[]> {
  const parsed = parseWorkflow(body);
  if (!parsed.ok) throw new InvalidInputError("not a valid workflow", parsed.problems);
  const { workflow } = parsed;
  await deps.store.create(workflow);
  return validate(workflow, { registry: deps.registry, phases: await deps.store.phases() });
}
