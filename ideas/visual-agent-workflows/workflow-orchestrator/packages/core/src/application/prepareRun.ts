import type { Phase } from "../domain/phase";
import type { Registry } from "../domain/registry";
import { hasErrors, validate, type Problem } from "../domain/validate";
import type { Workflow } from "../domain/workflow";
import { InvalidInputError } from "./errors";
import type { RunFiles } from "./RunFiles";

export type PrepareRunDeps = {
  runFiles: RunFiles;
  registry: Registry;
  phases: Phase[];
  newId: () => string;
  now: () => Date;
};

// Checks that a workflow can run with these inputs, then saves the run (its
// workflow and inputs) under a new id. Does not start it.
export async function prepareRun(deps: PrepareRunDeps, workflow: Workflow, inputs: Record<string, string>): Promise<string> {
  const problems = validate(workflow, { registry: deps.registry, phases: deps.phases });
  if (hasErrors(problems)) {
    throw new InvalidInputError(`workflow "${workflow.id}" can't run`, problems.filter((p) => p.severity === "error"));
  }

  const missing: Problem[] = workflow.inputs
    .filter((input) => input.required && !inputs[input.id]?.trim())
    .map((input) => ({ severity: "error", message: `input "${input.id}" (${input.label}) is required` }));
  if (missing.length > 0) throw new InvalidInputError("missing inputs", missing);

  const runId = deps.newId();
  await deps.runFiles.saveRun(runId, { workflow, inputs, startedAt: deps.now().toISOString() });
  return runId;
}
