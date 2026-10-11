import { Workflow } from "@orch/core";
import { describe, expect, it } from "vitest";
import baDiscoveryJson from "../../../../fixtures/sample-project/.cursor/workflows/ba-discovery.json";
import {
  addInput,
  addStep,
  connect,
  disconnect,
  freeStepId,
  idFromName,
  moveStep,
  newWorkflow,
  removeInput,
  removeStep,
  renameStep,
  updateAgentStep,
  updateGate,
  updateInput,
  updateWorkflow,
} from "../../src/domain/workflowEdits";
import { workflow } from "../support/sampleData";

// Applies a rename that must succeed.
function renamed(w: Workflow, from: string, to: string): Workflow {
  const result = renameStep(w, from, to);
  if (!result.ok) throw new Error(result.problem);
  return result.workflow;
}

describe("idFromName", () => {
  it.each([
    ["UX flows", "ux-flows"],
    ["  BA   discovery 2 ", "ba-discovery-2"],
    ["Café — déjà vu!", "cafe-deja-vu"],
    ["2nd pass", "workflow-2nd-pass"],
    ["???", "workflow"],
    ["", "workflow"],
  ])("%j → %j", (name, id) => {
    expect(idFromName(name)).toBe(id);
  });
});

describe("newWorkflow and addStep", () => {
  it("starts with one empty agent step, in the phase when one is given", () => {
    const fresh = newWorkflow({ id: "ux-flows", name: "UX flows", phase: "discovery" });

    expect(fresh).toMatchObject({ schema: 1, id: "ux-flows", name: "UX flows", phase: "discovery", inputs: [], edges: [] });
    expect(fresh.steps).toEqual([
      { id: "step-1", type: "agent", label: "New step", agent: "", skills: [], instructions: "", reads: [], writes: [], model: null },
    ]);
    expect(newWorkflow({ id: "x", name: "X", phase: null })).not.toHaveProperty("phase");
  });

  it("adds a step with a free id to the right of the rightmost node", () => {
    const start = moveStep(newWorkflow({ id: "w", name: "W", phase: null }), "step-1", { x: 100, y: 40 });

    const { workflow: next, stepId } = addStep(start, "agent");

    expect(stepId).toBe("step-2");
    expect(next.layout["step-2"]).toEqual({ x: 380, y: 40 });
    expect(start.steps).toHaveLength(1);
  });

  it("places a new step right of steps drawn without a saved position, not on top of them", () => {
    const { workflow: next, stepId } = addStep({ ...workflow, layout: {} }, "agent");
    expect(next.layout[stepId]).toEqual({ x: 840, y: 0 });
  });

  it("adds a gate that sends rejections to the last agent step, or to itself when there is none", () => {
    const { workflow: withGate, stepId } = addStep(workflow, "gate");
    const lonely = addStep(removeStep(newWorkflow({ id: "w", name: "W", phase: null }), "step-1"), "gate");

    expect(stepId).toBe("gate-1");
    expect(withGate.steps.at(-1)).toEqual({ id: "gate-1", type: "gate", label: "Review", shows: [], onReject: "design", maxRevisions: 3 });
    expect(lonely.workflow.steps[0]).toMatchObject({ id: "gate-1", onReject: "gate-1" });
    expect(lonely.workflow.layout["gate-1"]).toEqual({ x: 0, y: 0 });
  });

  it("picks the first unused number", () => {
    const w = { ...workflow, steps: [...workflow.steps, { ...workflow.steps[0]!, id: "step-2" }] };
    expect(freeStepId(w, "step")).toBe("step-1");
    expect(freeStepId(renamed(w, "elicit", "step-1"), "step")).toBe("step-3");
  });
});

describe("removeStep", () => {
  it("drops the step, its edges and its position", () => {
    const placed = moveStep(workflow, "review", { x: 1, y: 2 });

    const next = removeStep(placed, "review");

    expect(next.steps.map((s) => s.id)).toEqual(["elicit", "design"]);
    expect(next.edges).toEqual([]);
    expect(next.layout).toEqual({});
  });

  it("leaves a gate pointing at the removed step, for the validator to report", () => {
    expect(removeStep(workflow, "elicit").steps.find((s) => s.id === "review")).toMatchObject({ onReject: "elicit" });
  });
});

describe("renameStep", () => {
  it("follows the new id into edges, onReject and layout", () => {
    const next = renamed(moveStep(workflow, "elicit", { x: 5, y: 5 }), "elicit", "write");

    expect(next.steps.map((s) => s.id)).toEqual(["write", "review", "design"]);
    expect(next.edges).toEqual([
      { from: "write", to: "review" },
      { from: "review", to: "design" },
    ]);
    expect(next.steps[1]).toMatchObject({ onReject: "write" });
    expect(next.layout).toEqual({ write: { x: 5, y: 5 } });
  });

  it("refuses a taken or badly formed id and changes nothing", () => {
    expect(renameStep(workflow, "elicit", "design")).toEqual({ ok: false, problem: '"design" is already used by another step' });
    expect(renameStep(workflow, "elicit", "Write It")).toMatchObject({ ok: false });
    expect(renameStep(workflow, "elicit", "elicit")).toEqual({ ok: true, workflow });
  });
});

describe("connect and disconnect", () => {
  it("replaces the step that came next, and ignores a step leading to itself", () => {
    const next = connect(workflow, "elicit", "design");

    expect(next.edges).toEqual([
      { from: "review", to: "design" },
      { from: "elicit", to: "design" },
    ]);
    expect(connect(workflow, "elicit", "elicit")).toBe(workflow);
  });

  it("removes the edge leaving a step", () => {
    expect(disconnect(workflow, "elicit").edges).toEqual([{ from: "review", to: "design" }]);
  });
});

describe("updating fields", () => {
  it("changes an agent step's fields, and ignores a gate", () => {
    const next = updateAgentStep(workflow, "elicit", { agent: "architect", skills: [] });
    expect(next.steps[0]).toMatchObject({ agent: "architect", skills: [] });
    expect(updateAgentStep(workflow, "review", { agent: "x" })).toEqual(workflow);
  });

  it("changes a gate's fields, and ignores an agent step", () => {
    expect(updateGate(workflow, "review", { maxRevisions: 1 }).steps[1]).toMatchObject({ maxRevisions: 1 });
    expect(updateGate(workflow, "elicit", { maxRevisions: 1 })).toEqual(workflow);
  });

  it("changes the workflow's fields; a null phase removes it", () => {
    expect(updateWorkflow(workflow, { name: "Renamed", phase: "delivery" })).toMatchObject({ name: "Renamed", phase: "delivery" });
    expect(updateWorkflow(workflow, { phase: null })).not.toHaveProperty("phase");
    expect(updateWorkflow(workflow, { name: "Same phase" }).phase).toBe("discovery");
  });
});

describe("inputs", () => {
  it("adds inputs with the first free id, changes and removes them by position", () => {
    let w = addInput(addInput({ ...workflow, inputs: [] }));
    expect(w.inputs).toEqual([
      { id: "input-1", label: "", type: "text", required: false },
      { id: "input-2", label: "", type: "text", required: false },
    ]);

    w = updateInput(w, 1, { id: "audience", label: "Who is it for?", required: true });
    w = removeInput(w, 0);
    expect(w.inputs).toEqual([{ id: "audience", label: "Who is it for?", type: "text", required: true }]);
    expect(addInput({ ...w, inputs: [{ ...w.inputs[0]!, id: "input-1" }] }).inputs.at(-1)?.id).toBe("input-2");
  });
});

describe("drawing the BA workflow from scratch", () => {
  it("gives the same workflow as ba-discovery.json, apart from layout", () => {
    const expected = Workflow.parse(baDiscoveryJson);
    const [elicit, review, design] = expected.steps as [Workflow["steps"][0], Workflow["steps"][0], Workflow["steps"][0]];
    if (elicit.type !== "agent" || review.type !== "gate" || design.type !== "agent") throw new Error("unexpected fixture");

    let w = newWorkflow({ id: "ba-discovery", name: "BA discovery", phase: "discovery" });
    w = updateWorkflow(w, { inputs: expected.inputs });
    w = renamed(w, "step-1", "elicit");
    w = updateAgentStep(w, "elicit", { label: elicit.label, agent: elicit.agent, skills: elicit.skills, instructions: elicit.instructions, reads: elicit.reads, writes: elicit.writes });
    const gate = addStep(w, "gate");
    w = renamed(gate.workflow, gate.stepId, "review");
    w = updateGate(w, "review", { label: review.label, shows: review.shows });
    const next = addStep(w, "agent");
    w = renamed(next.workflow, next.stepId, "design");
    w = updateAgentStep(w, "design", { label: design.label, agent: design.agent, skills: design.skills, instructions: design.instructions, reads: design.reads, writes: design.writes });
    w = connect(connect(w, "elicit", "review"), "review", "design");

    expect({ ...w, layout: {} }).toEqual({ ...expected, layout: {} });
  });
});
