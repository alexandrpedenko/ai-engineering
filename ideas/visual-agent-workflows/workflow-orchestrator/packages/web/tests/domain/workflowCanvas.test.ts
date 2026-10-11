import { describe, expect, it } from "vitest";
import { toCanvas } from "../../src/domain/workflowCanvas";
import { workflow } from "../support/sampleData";

describe("toCanvas", () => {
  it("draws a node per step at its saved position, or in a row by order", () => {
    const placed = { ...workflow, layout: { review: { x: 50, y: 60 } } };

    const { nodes } = toCanvas(placed, [], "review");

    expect(nodes.map((n) => [n.id, n.type, n.position, n.selected])).toEqual([
      ["elicit", "agent", { x: 0, y: 0 }, false],
      ["review", "gate", { x: 50, y: 60 }, true],
      ["design", "agent", { x: 560, y: 0 }, false],
    ]);
  });

  it("draws next-step edges and a gate's reject edge", () => {
    expect(toCanvas(workflow, [], null).edges).toEqual([
      { id: "next:elicit->review", kind: "next", source: "elicit", target: "review" },
      { id: "next:review->design", kind: "next", source: "review", target: "design" },
      { id: "reject:review", kind: "reject", source: "review", target: "elicit" },
    ]);
  });

  it("gives every edge its own id, even when a step leads to two", () => {
    const branching = { ...workflow, edges: [...workflow.edges, { from: "elicit", to: "design" }] };
    const ids = toCanvas(branching, [], null).edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("draws no reject edge to a missing step or to the gate itself", () => {
    const missing = { ...workflow, steps: workflow.steps.map((s) => (s.type === "gate" ? { ...s, onReject: "gone" } : s)) };
    const itself = { ...workflow, steps: workflow.steps.map((s) => (s.type === "gate" ? { ...s, onReject: s.id } : s)) };

    expect(toCanvas(missing, [], null).edges.map((e) => e.kind)).toEqual(["next", "next"]);
    expect(toCanvas(itself, [], null).edges.map((e) => e.kind)).toEqual(["next", "next"]);
  });

  it("marks each node with its worst problem and lists its messages", () => {
    const { nodes } = toCanvas(
      workflow,
      [
        { severity: "warning", stepId: "elicit", message: "w1" },
        { severity: "error", stepId: "elicit", message: "e1" },
        { severity: "warning", stepId: "design", message: "w2" },
        { severity: "warning", message: "no phase" },
      ],
      null,
    );

    expect(nodes.map((n) => [n.id, n.severity, n.problems])).toEqual([
      ["elicit", "error", ["w1", "e1"]],
      ["review", null, []],
      ["design", "warning", ["w2"]],
    ]);
  });
});
