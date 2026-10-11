import { describe, expect, it } from "vitest";
import { checkWorkflow } from "../../src/application/checkWorkflow";
import { MemoryWorkflowStore } from "../support/MemoryWorkflowStore";
import { baWorkflowJson, registry } from "../support/workflows";

describe("checkWorkflow", () => {
  it("returns a workflow's problems without saving it", async () => {
    const store = new MemoryWorkflowStore();
    const json = baWorkflowJson();
    json.steps[2]!.agent = "ghost";

    const problems = await checkWorkflow({ store, registry }, json);

    expect(problems).toEqual([{ severity: "error", stepId: "design", message: 'unknown agent "ghost"' }]);
    expect(store.workflows.size).toBe(0);
  });

  it("returns no problems for a valid workflow", async () => {
    expect(await checkWorkflow({ store: new MemoryWorkflowStore(), registry }, baWorkflowJson())).toEqual([]);
  });

  it("returns schema problems, not an error, for a body that isn't a workflow", async () => {
    const problems = await checkWorkflow({ store: new MemoryWorkflowStore(), registry }, { name: "x" });

    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((p) => p.severity === "error")).toBe(true);
  });
});
