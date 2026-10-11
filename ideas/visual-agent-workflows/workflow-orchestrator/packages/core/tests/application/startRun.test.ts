import { describe, expect, it } from "vitest";
import { InvalidInputError } from "../../src/application/errors";
import { startRun } from "../../src/application/startRun";
import { DEFAULT_PHASES } from "../../src/domain/phase";
import { FakeRunEngine } from "../support/FakeRunEngine";
import { MemoryRunFiles } from "../support/MemoryRunFiles";
import { baWorkflow, registry } from "../support/workflows";

function setup() {
  const engine = new FakeRunEngine();
  const runFiles = new MemoryRunFiles();
  return { engine, runFiles, deps: { engine, runFiles, registry, phases: DEFAULT_PHASES, newId: () => "run-42" } };
}

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
  it("saves the workflow and inputs, then starts it under a new run id", async () => {
    const { deps, engine, runFiles } = setup();

    const result = await startRun(deps, baWorkflow(), { focus: "pricing" });

    expect(result.runId).toBe("run-42");
    expect(runFiles.runs.get("run-42")).toEqual({ workflow: baWorkflow(), inputs: { focus: "pricing" } });
    expect(engine.calls).toEqual([{ method: "start", runId: "run-42", workflowId: "ba-discovery", arg: { focus: "pricing" } }]);
  });

  it("refuses a workflow with errors and lists only the errors", async () => {
    const { deps, engine, runFiles } = setup();
    const broken = baWorkflow((w) => {
      Object.assign(w.steps[0]!, { agent: "ghost" });
      delete (w as { phase?: string }).phase;
    });

    expect(await problemsOf(startRun(deps, broken, {}))).toEqual(['unknown agent "ghost"']);
    expect(engine.calls).toEqual([]);
    expect(runFiles.runs.size).toBe(0);
  });

  it("refuses a missing required input", async () => {
    const { deps } = setup();
    const workflow = baWorkflow((w) => Object.assign(w.inputs[0]!, { required: true }));

    expect(await problemsOf(startRun(deps, workflow, { focus: "  " }))).toEqual(['input "focus" (What to focus on) is required']);
  });
});
