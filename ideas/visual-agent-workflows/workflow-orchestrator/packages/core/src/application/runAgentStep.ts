import { buildPrompt, resolveModel } from "../domain/buildPrompt";
import { diffSnapshots, type Snapshot } from "../domain/outputs";
import { protectedWrites } from "../domain/protectedPaths";
import type { Registry, Skill } from "../domain/registry";
import type { RunEvent, RunState, StepRecord } from "../domain/runState";
import type { AgentStep } from "../domain/workflow";
import type { AgentRunResult, AgentRuntime, RunHandle } from "./AgentRuntime";
import { InvalidInputError } from "./errors";
import type { ProjectFiles } from "./ProjectFiles";
import type { RunFiles } from "./RunFiles";

export type AgentStepDeps = {
  runtime: AgentRuntime;
  registry: Registry;
  projectFiles: ProjectFiles;
  runFiles: RunFiles;
  cwd: string; // the host project root
  defaultModel: { id: string };
  doNotTouch: string[];
  onEvent: (runId: string, event: RunEvent) => void;
  // Told about the agent run as soon as it exists (null once the step is
  // done with it), so it can be cancelled from outside.
  onHandle?: (runId: string, handle: RunHandle | null) => void;
  // An agent run still going after this long is cancelled and the step fails.
  stepTimeoutMs?: number;
  now?: () => Date;
};

// The baseline a new attempt's changes are measured from.
type Baseline = { before: Snapshot; baseTree: string | null };

// Where to measure this attempt from: a ref left by this attempt (its agent
// run is gone, so a new one starts over the same baseline), else the previous
// attempt's when that attempt failed (its partial edits belong to this step),
// else the project now.
async function baselineFor(deps: AgentStepDeps, runId: string, step: AgentStep, attempt: number, state: RunState, treeName: string): Promise<Baseline> {
  const own = await deps.runFiles.getRef(runId, step.id, attempt);
  if (own) return { before: own.before, baseTree: own.baseTree };
  if (state.steps[step.id]?.status === "failed" && attempt > 1) {
    const failed = await deps.runFiles.getRef(runId, step.id, attempt - 1);
    if (failed) return { before: failed.before, baseTree: failed.baseTree };
  }
  return { before: await deps.projectFiles.snapshot(step.writes), baseTree: await deps.projectFiles.recordTree(treeName) };
}

// Cancels the agent run after `timeoutMs`. `stop()` clears the timer and
// says whether it fired, and the cancel's error if the cancel failed.
function startTimer(handle: RunHandle, timeoutMs: number | undefined) {
  let fired = false;
  let cancelError: unknown = null;
  let cancelling: Promise<void> = Promise.resolve();
  const timer =
    timeoutMs === undefined
      ? null
      : setTimeout(() => {
          fired = true;
          cancelling = (async () => {
            try {
              await handle.cancel();
            } catch (error) {
              cancelError = error;
            }
          })();
        }, timeoutMs);
  return {
    stop: async () => {
      if (timer) clearTimeout(timer);
      await cancelling;
      return { fired, cancelError };
    },
  };
}

// Runs one attempt of an agent step. If this attempt was already started (a
// run ref exists) it reattaches to that agent run instead of starting a new
// one. An agent that can't be started gives a failed record; an error while
// waiting on a started agent is thrown (the run is then interrupted and can
// reattach). Which files changed is read from disk before and after, not from
// the agent's summary; the project's git tree from before is kept for the
// gate's diffs. A change to a protected path (doNotTouch, agent
// configuration) fails the step.
export async function runAgentStep(deps: AgentStepDeps, runId: string, step: AgentStep, state: RunState): Promise<StepRecord> {
  const agent = deps.registry.agents.find((a) => a.name === step.agent);
  if (!agent) throw new InvalidInputError(`agent "${step.agent}" is not in the project`);
  const skills = step.skills.map((name) => {
    const skill = deps.registry.skills.find((s) => s.name === name);
    if (!skill) throw new InvalidInputError(`skill "${name}" is not in the project`);
    return skill;
  }) satisfies Skill[];

  const previous = state.steps[step.id]?.agentRunIds ?? [];
  const attempt = previous.length + 1;
  deps.onEvent(runId, { type: "step-started", stepId: step.id, attempt });

  const ref = await deps.runFiles.getRef(runId, step.id, attempt);
  let handle = ref ? await deps.runtime.attach(ref.agentRunId, deps.cwd) : null;
  const reattached = handle !== null;
  const { before, baseTree } = ref && handle ? ref : await baselineFor(deps, runId, step, attempt, state, `${runId}/${step.id}-${attempt}`);
  const record = (fields: Omit<StepRecord, "baseTree">): StepRecord => (baseTree ? { ...fields, baseTree } : fields);

  if (!handle) {
    const message = buildPrompt({
      step,
      agent,
      skills,
      inputs: state.inputs,
      feedback: state.feedback[step.id] ?? [],
      doNotTouch: deps.doNotTouch,
    });
    try {
      handle = await deps.runtime.start({
        cwd: deps.cwd,
        model: resolveModel(step, agent, deps.defaultModel),
        message,
        key: `${runId}:${step.id}:${attempt}`,
        subagents: deps.registry.agents.map((a) => ({ name: a.name, description: a.description, prompt: a.body })),
        doNotTouch: deps.doNotTouch,
      });
    } catch (error) {
      // The agent never ran (wrong plan, bad key, unknown model…): a failed
      // step the person can retry once it's fixed, not a crashed run.
      const failed = record({
        status: "failed",
        agentRunIds: previous,
        writes: [],
        missing: [],
        summary: `couldn't start the agent: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: 0,
      });
      deps.onEvent(runId, { type: "step-finished", stepId: step.id, record: failed });
      return failed;
    }
    const startedAt = (deps.now?.() ?? new Date()).toISOString();
    await deps.runFiles.putRef({ runId, stepId: step.id, attempt, agentRunId: handle.id, before, baseTree, startedAt });
  }

  deps.onHandle?.(runId, handle);
  const timer = startTimer(handle, deps.stepTimeoutMs);
  let result: AgentRunResult;
  let timeout: Awaited<ReturnType<typeof timer.stop>>;
  try {
    if (!reattached) for await (const event of handle.events()) deps.onEvent(runId, { type: "agent-event", stepId: step.id, event });
    result = await handle.wait();
  } finally {
    timeout = await timer.stop();
    deps.onHandle?.(runId, null);
  }
  const timedOut = timeout.fired;
  const after = await deps.projectFiles.snapshot(step.writes);
  const { writes, missing } = diffSnapshots(before, after, step.writes);
  const forbidden = protectedWrites(writes, deps.doNotTouch);

  let summary = result.status === "cancelled" ? result.summary || "cancelled" : result.summary;
  if (timedOut) {
    const cancel = timeout.cancelError ? ` (cancelling failed: ${timeout.cancelError instanceof Error ? timeout.cancelError.message : String(timeout.cancelError)})` : "";
    summary = `timed out after ${Math.round((deps.stepTimeoutMs ?? 0) / 60_000)} min${cancel}`;
  }
  if (forbidden.length > 0) summary = `changed files it must not touch: ${forbidden.join(", ")}`;
  const done = record({
    status: result.status === "finished" && forbidden.length === 0 && !timedOut ? "done" : "failed",
    agentRunIds: [...previous, handle.id],
    writes,
    missing,
    summary,
    durationMs: result.durationMs,
  });
  if (result.usage) done.usage = result.usage;
  deps.onEvent(runId, { type: "step-finished", stepId: step.id, record: done });
  return done;
}
