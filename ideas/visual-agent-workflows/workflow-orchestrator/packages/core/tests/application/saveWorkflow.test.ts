import { describe, expect, it } from "vitest";
import { InvalidInputError } from "../../src/application/errors";
import { saveWorkflow } from "../../src/application/saveWorkflow";
import { MemoryWorkflowStore } from "../support/MemoryWorkflowStore";
import { baWorkflowJson, registry } from "../support/workflows";

describe("saveWorkflow", () => {
  it("saves a valid workflow and returns no problems", async () => {
    const store = new MemoryWorkflowStore();

    expect(await saveWorkflow({ store, registry }, "ba-discovery", baWorkflowJson())).toEqual([]);
    expect(store.workflows.get("ba-discovery")?.name).toBe("BA discovery");
  });

  it("still saves a workflow with errors, and returns them", async () => {
    const store = new MemoryWorkflowStore();
    const json = baWorkflowJson();
    json.steps[0]!.agent = "ghost";

    const problems = await saveWorkflow({ store, registry }, "ba-discovery", json);

    expect(problems).toContainEqual({ severity: "error", stepId: "elicit", message: 'unknown agent "ghost"' });
    expect(store.workflows.has("ba-discovery")).toBe(true);
  });

  it("refuses a body that isn't a workflow, or whose id doesn't match", async () => {
    const store = new MemoryWorkflowStore();

    await expect(saveWorkflow({ store, registry }, "ba-discovery", { name: "x" })).rejects.toBeInstanceOf(InvalidInputError);
    await expect(saveWorkflow({ store, registry }, "other", baWorkflowJson())).rejects.toThrow(`the workflow's id "ba-discovery" doesn't match "other"`);
    expect(store.workflows.size).toBe(0);
  });
});
