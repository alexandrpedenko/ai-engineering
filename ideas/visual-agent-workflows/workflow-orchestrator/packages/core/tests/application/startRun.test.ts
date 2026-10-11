import { describe, expect, it } from "vitest";
import { InvalidInputError } from "../../src/application/errors";
import type { RunEngine, RunOutcome } from "../../src/application/RunEngine";
import { startRun } from "../../src/application/startRun";
import { DEFAULT_PHASES } from "../../src/domain/phase";
import type { Workflow } from "../../src/domain/workflow";
import { baWorkflow, registry } from "../support/workflows";

// A RunEngine that records what it was asked to start.
function fakeEngine() {
  const started: { runId: string; workflow: Workflow; inputs: Record<string, string> }[] = [];
  const engine: RunEngine = {
    start: async (runId, workflow, inputs) => {
      started.push({ runId, workflow, inputs });
      return { status: "finished", state: {} } as unknown as RunOutcome;
    },
    resume: async () => {
      throw new Error("not used");
    },
    outcome: async () => null,
  };
  return { engine, started };
}

const deps = (engine: RunEngine) => ({ engine, registry, phases: DEFAULT_PHASES, newId: () => "run-42" });

async function problemsOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof InvalidInputError) return error.problems.map((p) => p.message);
    throw error;
  }
  throw new Error("expected InvalidInputError");
}

describe("startRun", () => {
  it("starts a valid workflow under a new run id", async () => {
    const { engine, started } = fakeEngine();

    const result = await startRun(deps(engine), baWorkflow(), { focus: "pricing" });

    expect(result.runId).toBe("run-42");
    expect(started).toEqual([{ runId: "run-42", workflow: baWorkflow(), inputs: { focus: "pricing" } }]);
  });

  it("refuses a workflow with errors and lists only the errors", async () => {
    const { engine, started } = fakeEngine();
    const broken = baWorkflow((w) => {
      Object.assign(w.steps[0]!, { agent: "ghost" });
      delete (w as { phase?: string }).phase;
    });

    expect(await problemsOf(startRun(deps(engine), broken, {}))).toEqual(['unknown agent "ghost"']);
    expect(started).toEqual([]);
  });

  it("refuses a missing required input", async () => {
    const { engine } = fakeEngine();
    const workflow = baWorkflow((w) => Object.assign(w.inputs[0]!, { required: true }));

    expect(await problemsOf(startRun(deps(engine), workflow, { focus: "  " }))).toEqual([
      'input "focus" (What to focus on) is required',
    ]);
  });
});
