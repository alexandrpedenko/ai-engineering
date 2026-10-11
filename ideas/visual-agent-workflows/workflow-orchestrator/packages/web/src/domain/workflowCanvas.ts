import type { Problem, Step, Workflow } from "@orch/core";
import { positionOf } from "./workflowGraph";

// What the canvas draws, as plain data: one node per step and one edge per
// connection. The canvas component turns these into React Flow's own shapes.

export type CanvasNode = {
  id: string;
  type: Step["type"];
  position: { x: number; y: number };
  selected: boolean;
  step: Step;
  severity: Problem["severity"] | null; // the worst problem on this step
  problems: string[];
};

// "next": the step that runs after `source`. "reject": where a gate sends
// rejections (drawn dashed, and can only be changed in the inspector).
export type CanvasEdge = { id: string; kind: "next" | "reject"; source: string; target: string };

export type Canvas = { nodes: CanvasNode[]; edges: CanvasEdge[] };

// The canvas for a workflow, its problems and the selected step. A step with
// no saved position is placed in a row by its order in the file.
export function toCanvas(workflow: Workflow, problems: Problem[], selectedId: string | null): Canvas {
  const nodes = workflow.steps.map((step): CanvasNode => {
    const own = problems.filter((problem) => problem.stepId === step.id);
    const severity = own.some((p) => p.severity === "error") ? "error" : own.length > 0 ? "warning" : null;
    return {
      id: step.id,
      type: step.type,
      position: positionOf(workflow, step.id),
      selected: step.id === selectedId,
      step,
      severity,
      problems: own.map((p) => p.message),
    };
  });

  const next = workflow.edges.map((edge): CanvasEdge => ({ id: `next:${edge.from}->${edge.to}`, kind: "next", source: edge.from, target: edge.to }));
  const reject = workflow.steps.flatMap((step): CanvasEdge[] =>
    step.type === "gate" && workflow.steps.some((s) => s.id === step.onReject) && step.onReject !== step.id
      ? [{ id: `reject:${step.id}`, kind: "reject", source: step.id, target: step.onReject }]
      : [],
  );
  return { nodes, edges: [...next, ...reject] };
}
