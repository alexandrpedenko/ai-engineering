import { buildPrompt, resolveModel } from "../domain/buildPrompt";
import { diffSnapshots, type Snapshot } from "../domain/outputs";
import type { Registry, Skill } from "../domain/registry";
import type { RunEvent, RunState, StepRecord } from "../domain/runState";
import type { AgentStep } from "../domain/workflow";
import type { AgentRuntime, RunHandle } from "./AgentRuntime";
import type { ProjectFiles } from "./ProjectFiles";
import type { RunFiles } from "./RunFiles";

export type AgentStepDeps = {
  runtime: AgentRuntime;
  registry: Registry;
  projectFiles: ProjectFiles;
  runFiles: RunFiles;
  cwd: string; // the host project root
  artefactGlobs: string[];
  defaultModel: { id: string };
  doNotTouch: string[];
  onEvent: (runId: string, event: RunEvent) => void;
  // Told about the agent run while the step waits on it (null once it's done),
  // so it can be cancelled from outside.
  onHandle?: (runId: string, handle: RunHandle | null) => void;
  now?: () => Date;
};

// Runs one attempt of an agent step. If this attempt was already started (a
// run ref exists) it reattaches to that agent run instead of starting a new
// one. Which files changed is read from disk before and after, not from the
// agent's summary.
export async function runAgentStep(deps: AgentStepDeps, runId: string, step: AgentStep, state: RunState): Promise<StepRecord> {
  const agent = deps.registry.agents.find((a) => a.name === step.agent);
  if (!agent) throw new Error(`agent "${step.agent}" is not in the project`);
  const skills = step.skills.map((name) => {
    const skill = deps.registry.skills.find((s) => s.name === name);
    if (!skill) throw new Error(`skill "${name}" is not in the project`);
    return skill;
  }) satisfies Skill[];

  const previous = state.steps[step.id]?.cursorRunIds ?? [];
  const attempt = previous.length + 1;
  const patterns = [...new Set([...step.writes, ...deps.artefactGlobs])];
  deps.onEvent(runId, { type: "step-started", stepId: step.id, attempt });

  let handle: RunHandle | null = null;
  let before: Snapshot;
  const ref = await deps.runFiles.getRef(runId, step.id, attempt);
  if (ref) handle = await deps.runtime.attach(ref.cursorRunId, deps.cwd);

  if (ref && handle) {
    before = ref.before;
  } else {
    before = await deps.projectFiles.snapshot(patterns);
    const message = buildPrompt({
      step,
      agent,
      skills,
      inputs: state.inputs,
      feedback: state.feedback[step.id] ?? [],
      doNotTouch: deps.doNotTouch,
    });
    handle = await deps.runtime.start({
      cwd: deps.cwd,
      model: resolveModel(step, agent, deps.defaultModel),
      message,
      key: `${runId}:${step.id}:${attempt}`,
    });
    const startedAt = (deps.now?.() ?? new Date()).toISOString();
    await deps.runFiles.putRef({ runId, stepId: step.id, attempt, cursorRunId: handle.id, before, startedAt });
    for await (const event of handle.events()) deps.onEvent(runId, { type: "agent-event", stepId: step.id, event });
  }

  deps.onHandle?.(runId, handle);
  let result: Awaited<ReturnType<RunHandle["wait"]>>;
  try {
    result = await handle.wait();
  } finally {
    deps.onHandle?.(runId, null);
  }
  const after = await deps.projectFiles.snapshot(patterns);
  const { writes, missing } = diffSnapshots(before, after, step.writes);

  const record: StepRecord = {
    status: result.status === "finished" ? "done" : "failed",
    cursorRunIds: [...previous, handle.id],
    writes,
    missing,
    summary: result.status === "cancelled" ? result.summary || "cancelled" : result.summary,
    durationMs: result.durationMs,
  };
  if (result.usage) record.usage = result.usage;
  deps.onEvent(runId, { type: "step-finished", stepId: step.id, record });
  return record;
}
