import { describe, expect, it } from "vitest";
import { agentStepsBefore, findStep, nextStep, positionOf, stepIdProblem, stepsInRunOrder, workflowIdProblem } from "../../src/domain/workflowGraph";
import { shuffledWorkflow, workflow } from "../support/sampleData";

describe("workflowGraph", () => {
  it("finds a step and the step after it", () => {
    expect(findStep(workflow, "review")?.type).toBe("gate");
    expect(findStep(workflow, "nope")).toBeUndefined();
    expect(nextStep(workflow, "elicit")).toBe("review");
    expect(nextStep(workflow, "design")).toBeNull();
  });

  it("lists the agent steps before a gate, nearest first, following edges only", () => {
    const longer = {
      ...workflow,
      steps: [...workflow.steps, { ...workflow.steps[1]!, id: "final", onReject: "design" }],
      edges: [...workflow.edges, { from: "design", to: "final" }],
    };

    expect(agentStepsBefore(longer, "final").map((s) => s.id)).toEqual(["design", "elicit"]);
    expect(agentStepsBefore(longer, "review").map((s) => s.id)).toEqual(["elicit"]);
    expect(agentStepsBefore(longer, "elicit")).toEqual([]);
  });

  it("stops on a loop of edges", () => {
    const loop = { ...workflow, edges: [...workflow.edges, { from: "design", to: "elicit" }] };
    expect(agentStepsBefore(loop, "review").map((s) => s.id)).toEqual(["elicit", "design"]);
  });

  it("says why an id can't name a step", () => {
    expect(stepIdProblem(workflow, "write-2")).toBeNull();
    expect(stepIdProblem(workflow, "elicit", "elicit")).toBeNull();
    expect(stepIdProblem(workflow, "elicit", "design")).toBe('"elicit" is already used by another step');
    expect(stepIdProblem(workflow, "Bad id")).toMatch(/lowercase letters/);
    expect(stepIdProblem(workflow, "")).toMatch(/lowercase letters/);
  });

  it("says why an id can't name a new workflow", () => {
    expect(workflowIdProblem("ux-flows", ["ba-discovery"])).toBeNull();
    expect(workflowIdProblem("ba-discovery", ["ba-discovery"])).toBe('a workflow "ba-discovery" already exists');
    expect(workflowIdProblem("UX", [])).toMatch(/lowercase letters/);
  });

  it("places a step at its saved position, or in a row by its place in the file", () => {
    const placed = { ...workflow, layout: { review: { x: 5, y: 6 } } };
    expect(positionOf(placed, "review")).toEqual({ x: 5, y: 6 });
    expect(positionOf(placed, "design")).toEqual({ x: 560, y: 0 });
  });

  it("lists steps in the order a run takes them, not the order of the file", () => {
    expect(stepsInRunOrder(shuffledWorkflow).map((s) => s.id)).toEqual(["elicit", "design", "architect", "review"]);
    expect(stepsInRunOrder(workflow).map((s) => s.id)).toEqual(["elicit", "review", "design"]);
  });

  it("puts steps the path doesn't reach after it, in file order, and stops on a loop", () => {
    const loose = { ...shuffledWorkflow, edges: [{ from: "elicit", to: "design" }] };
    expect(stepsInRunOrder(loose).map((s) => s.id)).toEqual(["elicit", "design", "architect", "review"]);

    const loop = { ...workflow, edges: [...workflow.edges, { from: "design", to: "review" }] };
    expect(stepsInRunOrder(loop).map((s) => s.id)).toEqual(["elicit", "review", "design"]);
  });
});
