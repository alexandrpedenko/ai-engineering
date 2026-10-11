import type { WorkflowSummary } from "@orch/core";
import { describe, expect, it } from "vitest";
import { groupWorkflowsByPhase } from "../../src/domain/grouping";

const wf = (id: string, name: string, phase?: string): WorkflowSummary => ({ id, name, agents: [], skills: [], problems: [], ...(phase ? { phase } : {}) });
const phases = [
  { id: "delivery", name: "Delivery", order: 2 },
  { id: "discovery", name: "Discovery", order: 1 },
];

describe("groupWorkflowsByPhase", () => {
  it("orders phases by `order`, keeps empty ones, and sorts workflows by name", () => {
    const groups = groupWorkflowsByPhase(phases, [wf("b", "Designer", "discovery"), wf("a", "Architect", "discovery")]);

    expect(groups.map((g) => g.phase?.id)).toEqual(["discovery", "delivery"]);
    expect(groups[0]?.workflows.map((w) => w.name)).toEqual(["Architect", "Designer"]);
    expect(groups[1]?.workflows).toEqual([]);
  });

  it("puts workflows with no phase or an unknown one under Unsorted, last", () => {
    const groups = groupWorkflowsByPhase(phases, [wf("x", "X"), wf("y", "Y", "testing"), wf("z", "Z", "delivery")]);

    expect(groups.at(-1)).toEqual({ phase: null, workflows: [wf("x", "X"), wf("y", "Y", "testing")] });
  });

  it("has no Unsorted group when every workflow has a known phase", () => {
    expect(groupWorkflowsByPhase(phases, [wf("z", "Z", "delivery")]).some((g) => g.phase === null)).toBe(false);
  });
});
