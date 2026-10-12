import { describe, expect, it } from "vitest";
import { diffBaseFor, gateFileChanges, gateFiles } from "../../src/domain/gateFiles";
import type { RunState, StepRecord } from "../../src/domain/runState";
import type { GateStep, Workflow } from "../../src/domain/workflow";
import { baWorkflow } from "../support/workflows";

const record = (writes: StepRecord["writes"], baseTree?: string): StepRecord => ({
  status: "done",
  cursorRunIds: ["r1"],
  writes,
  missing: [],
  summary: "",
  durationMs: 0,
  ...(baseTree ? { baseTree } : {}),
});

const state = (steps: Record<string, StepRecord>): RunState => ({
  workflowId: "ba-discovery",
  inputs: {},
  steps,
  feedback: {},
  decisions: {},
  revisions: {},
  stoppedAt: null,
});

// The BA workflow with a second gate after "design" that sends rejections back to "elicit".
function withLateGate(): { workflow: Workflow; gate: GateStep } {
  const workflow = baWorkflow((w) => {
    w.steps.push({ id: "final", type: "gate", label: "Final review", shows: [], onReject: "elicit" });
    w.edges.push({ from: "design", to: "final" });
  });
  return { workflow, gate: workflow.steps.find((s) => s.id === "final") as GateStep };
}

describe("gateFiles", () => {
  it("uses the gate's own shows when it has any", () => {
    const workflow = baWorkflow();
    const gate = workflow.steps[1] as GateStep;
    const steps = { elicit: record([{ path: "kb/other.md", change: "created" }]) };

    expect(gateFiles(workflow, gate, state(steps))).toEqual(["discovery/requirements.md"]);
  });

  it("shows what the step before an empty-shows gate created or modified", () => {
    const workflow = baWorkflow((w) => Object.assign(w.steps[1]!, { shows: [] }));
    const gate = workflow.steps[1] as GateStep;
    const steps = {
      elicit: record([
        { path: "ux-space/flows.md", change: "created" },
        { path: "kb/old.md", change: "deleted" },
        { path: "kb/glossary.md", change: "modified" },
      ]),
    };

    expect(gateFiles(workflow, gate, state(steps))).toEqual(["ux-space/flows.md", "kb/glossary.md"]);
  });

  it("collects every agent step from onReject up to the gate, each file once", () => {
    const { workflow, gate } = withLateGate();
    const steps = {
      elicit: record([{ path: "discovery/requirements.md", change: "created" }]),
      design: record([
        { path: "discovery/design.md", change: "created" },
        { path: "discovery/requirements.md", change: "modified" },
      ]),
    };

    expect(gateFiles(workflow, gate, state(steps))).toEqual(["discovery/requirements.md", "discovery/design.md"]);
  });

  it("gives nothing when the steps before the gate changed nothing or haven't run", () => {
    const { workflow, gate } = withLateGate();

    expect(gateFiles(workflow, gate, state({ elicit: record([]) }))).toEqual([]);
  });

  it("gives nothing when onReject doesn't lead to the gate", () => {
    const workflow = baWorkflow((w) => Object.assign(w.steps[1]!, { shows: [], onReject: "design" }));
    const gate = workflow.steps[1] as GateStep;

    expect(gateFiles(workflow, gate, state({ design: record([{ path: "a.md", change: "created" }]) }))).toEqual([]);
  });
});

describe("gateFileChanges", () => {
  it("lists the gate's shows with what the steps did, unchanged when nothing touched them", () => {
    const workflow = baWorkflow((w) => Object.assign(w.steps[1]!, { shows: ["discovery/requirements.md", "discovery/brief.md"] }));
    const gate = workflow.steps[1] as GateStep;
    const steps = { elicit: record([{ path: "discovery/requirements.md", change: "modified" }]) };

    expect(gateFileChanges(workflow, gate, state(steps))).toEqual([
      { path: "discovery/requirements.md", change: "modified" },
      { path: "discovery/brief.md", change: "unchanged" },
    ]);
  });

  it("without shows, lists every changed file in the order first changed, deleted files last", () => {
    const workflow = baWorkflow((w) => Object.assign(w.steps[1]!, { shows: [] }));
    const gate = workflow.steps[1] as GateStep;
    const steps = {
      elicit: record([
        { path: "kb/old.md", change: "deleted" },
        { path: "ux-space/flows.md", change: "created" },
        { path: "kb/glossary.md", change: "modified" },
      ]),
    };

    expect(gateFileChanges(workflow, gate, state(steps))).toEqual([
      { path: "ux-space/flows.md", change: "created" },
      { path: "kb/glossary.md", change: "modified" },
      { path: "kb/old.md", change: "deleted" },
    ]);
  });

  it("takes the steps' changes together: created then modified is created, created then deleted is left out", () => {
    const { workflow, gate } = withLateGate();
    const steps = {
      elicit: record([
        { path: "a.md", change: "created" },
        { path: "b.md", change: "created" },
        { path: "c.md", change: "deleted" },
        { path: "d.md", change: "modified" },
      ]),
      design: record([
        { path: "a.md", change: "modified" },
        { path: "b.md", change: "deleted" },
        { path: "c.md", change: "created" },
        { path: "d.md", change: "deleted" },
      ]),
    };

    expect(gateFileChanges(workflow, gate, state(steps))).toEqual([
      { path: "a.md", change: "created" },
      { path: "c.md", change: "modified" },
      { path: "d.md", change: "deleted" },
    ]);
  });
});

describe("diffBaseFor", () => {
  it("is the tree recorded before the first agent step from onReject", () => {
    const { workflow, gate } = withLateGate();
    const steps = { elicit: record([], "tree-elicit"), design: record([], "tree-design") };

    expect(diffBaseFor(workflow, gate, state(steps))).toBe("tree-elicit");
  });

  it("skips gates between onReject and the gate", () => {
    const workflow = baWorkflow((w) => {
      w.steps.push({ id: "final", type: "gate", label: "Final review", shows: [], onReject: "review" });
      w.edges.push({ from: "design", to: "final" });
    });
    const gate = workflow.steps.find((s) => s.id === "final") as GateStep;

    expect(diffBaseFor(workflow, gate, state({ design: record([], "tree-design") }))).toBe("tree-design");
  });

  it("is null when that step has no tree or hasn't run", () => {
    const workflow = baWorkflow();
    const gate = workflow.steps[1] as GateStep;

    expect(diffBaseFor(workflow, gate, state({ elicit: record([]) }))).toBeNull();
    expect(diffBaseFor(workflow, gate, state({}))).toBeNull();
  });
});
