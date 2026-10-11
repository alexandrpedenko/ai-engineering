import { parseWorkflow } from "../domain/parseWorkflow";
import type { Registry } from "../domain/registry";
import { validate, type Problem } from "../domain/validate";
import type { WorkflowStore } from "./WorkflowStore";

// What's wrong with a workflow sent from outside, without saving it. A body
// that isn't a workflow gives its schema problems instead of an error, so a
// half-filled draft still gets an answer.
export async function checkWorkflow(deps: { store: WorkflowStore; registry: Registry }, body: unknown): Promise<Problem[]> {
  const parsed = parseWorkflow(body);
  if (!parsed.ok) return parsed.problems;
  return validate(parsed.workflow, { registry: deps.registry, phases: await deps.store.phases() });
}
