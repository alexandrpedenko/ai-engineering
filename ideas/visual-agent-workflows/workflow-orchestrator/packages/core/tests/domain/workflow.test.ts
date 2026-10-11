import { describe, expect, it } from "vitest";
import { Workflow } from "../../src/domain/workflow";
import { baWorkflowJson } from "../support/workflows";

describe("Workflow", () => {
  it("parses the BA workflow and fills defaults", () => {
    const workflow = Workflow.parse(baWorkflowJson());

    expect(workflow.steps).toHaveLength(3);
    expect(workflow.inputs[0]?.required).toBe(false);
    expect(workflow.layout).toEqual({});
    const gate = workflow.steps[1];
    expect(gate?.type === "gate" && gate.maxRevisions).toBe(3);
    const agent = workflow.steps[0];
    expect(agent?.type === "agent" && agent.model).toBeNull();
  });

  it("rejects an unknown key", () => {
    expect(Workflow.safeParse({ ...baWorkflowJson(), colour: "blue" }).success).toBe(false);
  });

  it("rejects a step id that can't be a node name", () => {
    const json = baWorkflowJson();
    (json.steps[0] as { id: string }).id = "__start__";
    expect(Workflow.safeParse(json).success).toBe(false);
  });

  it("rejects an unknown step type", () => {
    const json = baWorkflowJson();
    (json.steps[1] as { type: string }).type = "router";
    expect(Workflow.safeParse(json).success).toBe(false);
  });

  it("needs at least one step", () => {
    expect(Workflow.safeParse({ ...baWorkflowJson(), steps: [] }).success).toBe(false);
  });
});
