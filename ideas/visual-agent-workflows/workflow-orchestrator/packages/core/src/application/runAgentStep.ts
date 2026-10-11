import { buildPrompt, resolveModel } from "../domain/buildPrompt";
import type { Registry, Skill } from "../domain/registry";
import type { RunEvent, RunState, StepRecord } from "../domain/runState";
import type { AgentStep } from "../domain/workflow";
import type { AgentRuntime } from "./AgentRuntime";

export type AgentStepDeps = {
  runtime: AgentRuntime;
  registry: Registry;
  cwd: string; // the host project root
  defaultModel: { id: string };
  doNotTouch: string[];
  onEvent: (runId: string, event: RunEvent) => void;
};

// Runs one attempt of an agent step: builds the message, starts the agent,
// forwards its events, waits for it. Does not check files on disk (slice 3)
// and never reattaches to an earlier run.
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
  const message = buildPrompt({
    step,
    agent,
    skills,
    inputs: state.inputs,
    feedback: state.feedback[step.id] ?? [],
    doNotTouch: deps.doNotTouch,
  });

  deps.onEvent(runId, { type: "step-started", stepId: step.id, attempt });
  const handle = await deps.runtime.start({
    cwd: deps.cwd,
    model: resolveModel(step, agent, deps.defaultModel),
    message,
    key: `${runId}:${step.id}:${attempt}`,
  });
  for await (const event of handle.events()) deps.onEvent(runId, { type: "agent-event", stepId: step.id, event });
  const result = await handle.wait();

  const record: StepRecord = {
    status: result.status === "finished" ? "done" : "failed",
    cursorRunIds: [...previous, handle.id],
    writes: [],
    missing: [],
    summary: result.summary,
    durationMs: result.durationMs,
  };
  if (result.usage) record.usage = result.usage;
  deps.onEvent(runId, { type: "step-finished", stepId: step.id, record });
  return record;
}
