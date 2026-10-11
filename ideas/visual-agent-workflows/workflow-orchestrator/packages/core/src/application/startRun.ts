import type { Workflow } from "../domain/workflow";
import { type PrepareRunDeps, prepareRun } from "./prepareRun";
import type { RunEngine, RunOutcome } from "./RunEngine";

export type StartRunDeps = PrepareRunDeps & { engine: RunEngine };

// Checks and saves a run (prepareRun), then runs it until it stops moving.
export async function startRun(
  deps: StartRunDeps,
  workflow: Workflow,
  inputs: Record<string, string>,
): Promise<{ runId: string; outcome: RunOutcome }> {
  const runId = await prepareRun(deps, workflow, inputs);
  return { runId, outcome: await deps.engine.start(runId, workflow, inputs) };
}
