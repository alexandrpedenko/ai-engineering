import type { Registry } from "../domain/registry";
import { validate, type Problem } from "../domain/validate";
import type { Workflow } from "../domain/workflow";
import { NotFoundError } from "./errors";
import type { WorkflowStore } from "./WorkflowStore";

// One workflow and what's wrong with it. NotFoundError when there is no such file.
export async function readWorkflow(
  deps: { store: WorkflowStore; registry: Registry },
  id: string,
): Promise<{ workflow: Workflow; problems: Problem[] }> {
  const workflow = await deps.store.get(id);
  if (!workflow) throw new NotFoundError(`no workflow "${id}"`);
  return { workflow, problems: validate(workflow, { registry: deps.registry, phases: await deps.store.phases() }) };
}
