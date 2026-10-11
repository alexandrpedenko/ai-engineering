import type { Phase } from "../domain/phase";
import type { Registry } from "../domain/registry";
import { hasErrors, validate, type Problem } from "../domain/validate";
import type { Workflow } from "../domain/workflow";
import { InvalidInputError } from "./errors";
import type { RunEngine, RunOutcome } from "./RunEngine";

export type StartRunDeps = {
  engine: RunEngine;
  registry: Registry;
  phases: Phase[];
  newId: () => string;
};

// Starts a run of a workflow with the given inputs, after checking the
// workflow against the project and that every required input has a value.
export async function startRun(
  deps: StartRunDeps,
  workflow: Workflow,
  inputs: Record<string, string>,
): Promise<{ runId: string; outcome: RunOutcome }> {
  const problems = validate(workflow, { registry: deps.registry, phases: deps.phases });
  if (hasErrors(problems)) {
    throw new InvalidInputError(`workflow "${workflow.id}" can't run`, problems.filter((p) => p.severity === "error"));
  }

  const missing: Problem[] = workflow.inputs
    .filter((input) => input.required && !inputs[input.id]?.trim())
    .map((input) => ({ severity: "error", message: `input "${input.id}" (${input.label}) is required` }));
  if (missing.length > 0) throw new InvalidInputError("missing inputs", missing);

  const runId = deps.newId();
  return { runId, outcome: await deps.engine.start(runId, workflow, inputs) };
}
