import { describe, expect, it } from "vitest";
import { NotFoundError } from "../../src/application/errors";
import { readWorkflow } from "../../src/application/readWorkflow";
import { MemoryWorkflowStore } from "../support/MemoryWorkflowStore";
import { baWorkflow, registry } from "../support/workflows";

describe("readWorkflow", () => {
  it("returns the workflow and its problems", async () => {
    const store = new MemoryWorkflowStore([baWorkflow((w) => Object.assign(w, { phase: "testing" }))]);

    const { workflow, problems } = await readWorkflow({ store, registry }, "ba-discovery");

    expect(workflow.id).toBe("ba-discovery");
    expect(problems.map((p) => p.severity)).toEqual(["warning"]);
  });

  it("throws NotFoundError for an unknown workflow", async () => {
    await expect(readWorkflow({ store: new MemoryWorkflowStore(), registry }, "nope")).rejects.toBeInstanceOf(NotFoundError);
  });
});
