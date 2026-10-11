import { describe, expect, it } from "vitest";
import { ConflictError, InvalidInputError } from "../../src/application/errors";
import { createWorkflow } from "../../src/application/createWorkflow";
import { MemoryWorkflowStore } from "../support/MemoryWorkflowStore";
import { baWorkflow, baWorkflowJson, registry } from "../support/workflows";

describe("createWorkflow", () => {
  it("saves a new workflow and returns its problems", async () => {
    const store = new MemoryWorkflowStore();
    const json = baWorkflowJson();
    json.steps[0]!.agent = "ghost";

    const problems = await createWorkflow({ store, registry }, json);

    expect(store.workflows.get("ba-discovery")?.name).toBe("BA discovery");
    expect(problems).toEqual([{ severity: "error", stepId: "elicit", message: 'unknown agent "ghost"' }]);
  });

  it("refuses an id that already has a file, readable or not", async () => {
    const store = new MemoryWorkflowStore([baWorkflow()]);
    const broken = new MemoryWorkflowStore();
    broken.broken.set("ba-discovery", "not valid JSON");

    await expect(createWorkflow({ store, registry }, { ...baWorkflowJson(), name: "Other" })).rejects.toBeInstanceOf(ConflictError);
    await expect(createWorkflow({ store: broken, registry }, baWorkflowJson())).rejects.toThrow('a workflow "ba-discovery" already exists');
    expect(store.workflows.get("ba-discovery")?.name).toBe("BA discovery");
  });

  it("refuses a body that isn't a workflow", async () => {
    const store = new MemoryWorkflowStore();

    await expect(createWorkflow({ store, registry }, { name: "x" })).rejects.toBeInstanceOf(InvalidInputError);
    expect(store.workflows.size).toBe(0);
  });
});
