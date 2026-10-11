import type { Registry } from "../domain/registry";
import { validate, type Problem } from "../domain/validate";
import { Workflow } from "../domain/workflow";
import { InvalidInputError } from "./errors";
import type { WorkflowStore } from "./WorkflowStore";

// Saves a workflow sent from outside under `id`. Refuses a body that isn't a
// workflow or whose id differs from `id`. A workflow with validation errors is
// still saved (it just can't run); its problems are returned.
export async function saveWorkflow(deps: { store: WorkflowStore; registry: Registry }, id: string, body: unknown): Promise<Problem[]> {
  const parsed = Workflow.safeParse(body);
  if (!parsed.success) {
    throw new InvalidInputError(
      "not a valid workflow",
      parsed.error.issues.map((issue) => ({ severity: "error", message: `${issue.path.join(".") || "(body)"}: ${issue.message}` })),
    );
  }
  if (parsed.data.id !== id) throw new InvalidInputError(`the workflow's id "${parsed.data.id}" doesn't match "${id}"`);

  await deps.store.save(parsed.data);
  return validate(parsed.data, { registry: deps.registry, phases: await deps.store.phases() });
}
