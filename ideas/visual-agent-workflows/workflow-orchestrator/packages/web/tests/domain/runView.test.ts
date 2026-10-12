import { describe, expect, it } from "vitest";
import { runHeadline, stepTimeline } from "../../src/domain/runView";
import { logged, record, runDetails, runState, shuffledWorkflow, waitingRun } from "../support/sampleData";

const states = (rows: ReturnType<typeof stepTimeline>) => rows.map((r) => `${r.step.id}:${r.state}`);

describe("stepTimeline", () => {
  it("lists the steps in the order the run takes them", () => {
    const rows = stepTimeline(runDetails(null, { workflow: shuffledWorkflow }), []);
    expect(rows.map((r) => r.step.id)).toEqual(["elicit", "design", "architect", "review"]);
  });

  it("shows every step pending before anything happened", () => {
    expect(states(stepTimeline(runDetails(null, { busy: true }), []))).toEqual(["elicit:pending", "review:pending", "design:pending"]);
  });

  it("shows a step running between its start and finish events", () => {
    const events = logged([{ type: "step-started", stepId: "elicit", attempt: 1 }]);
    const rows = stepTimeline(runDetails(null, { busy: true }), events);
    expect(states(rows)).toEqual(["elicit:running", "review:pending", "design:pending"]);
    expect(rows[0]?.attempt).toBe(1);
  });

  it("shows the gate waiting, with the step's record from the run state", () => {
    const rows = stepTimeline(waitingRun(), []);
    expect(states(rows)).toEqual(["elicit:done", "review:waiting", "design:pending"]);
    expect(rows[0]?.record?.writes).toEqual([{ path: "discovery/requirements.md", change: "created" }]);
    expect(rows[1]?.shows).toEqual(["discovery/requirements.md"]);
  });

  it("takes a waiting gate's files from the outcome, not from the workflow", () => {
    const details = runDetails({ status: "waiting", gateId: "review", shows: ["ux-space/flows.md"], state: runState({ steps: { elicit: record() } }) });
    expect(stepTimeline(details, [])[1]?.shows).toEqual(["ux-space/flows.md"]);
  });

  it("takes newer records from step-finished events", () => {
    const failed = record({ status: "failed", summary: "boom", agentRunIds: ["a1", "a2"] });
    const events = logged([
      { type: "step-started", stepId: "elicit", attempt: 2 },
      { type: "step-finished", stepId: "elicit", record: failed },
    ]);
    const rows = stepTimeline(waitingRun(), events);
    expect(rows[0]).toMatchObject({ state: "failed", attempt: 2, record: { summary: "boom" } });
  });

  it("shows a second attempt running after a rejection, and the gate's decisions", () => {
    const state = runState({ steps: { elicit: record() }, decisions: { review: [{ decision: "reject", feedback: "more" }] } });
    const details = runDetails({ status: "waiting", gateId: "review", shows: [], state }, { busy: true });
    const events = logged([{ type: "step-started", stepId: "elicit", attempt: 2 }]);

    const rows = stepTimeline(details, events);

    expect(states(rows)).toEqual(["elicit:running", "review:rejected", "design:pending"]);
    expect(rows[0]?.attempt).toBe(2);
    expect(rows[1]?.decisions).toEqual([{ decision: "reject", feedback: "more" }]);
  });

  it("shows an approved gate and the steps after it done once finished", () => {
    const state = runState({ steps: { elicit: record(), design: record() }, decisions: { review: [{ decision: "reject", feedback: "x" }, { decision: "approve" }] } });
    expect(states(stepTimeline(runDetails({ status: "finished", state }), []))).toEqual(["elicit:done", "review:approved", "design:done"]);
  });

  it("shows the gate rejected when it ran out of revisions", () => {
    const state = runState({ steps: { elicit: record() }, decisions: { review: [{ decision: "reject", feedback: "no" }] }, stoppedAt: "review" });
    expect(states(stepTimeline(runDetails({ status: "rejected", gateId: "review", state }), []))[1]).toBe("review:rejected");
  });

  it("uses the outcome of the latest run-settled event over stale details", () => {
    const state = runState({ steps: { elicit: record(), design: record() }, decisions: { review: [{ decision: "approve" }] } });
    const events = logged([{ type: "run-settled", outcome: { status: "finished", state } }], 9);
    expect(states(stepTimeline(waitingRun(), events))).toEqual(["elicit:done", "review:approved", "design:done"]);
  });
});

describe("runHeadline", () => {
  it("says the run is moving while events arrive after the last settle", () => {
    expect(runHeadline(waitingRun(), logged([{ type: "step-started", stepId: "design", attempt: 1 }])).status).toBe("moving");
  });

  it("names the gate, the step, or the crash", () => {
    expect(runHeadline(waitingRun(), [])).toEqual({ status: "waiting", gateId: "review" });
    expect(runHeadline(runDetails({ status: "failed", stepId: "elicit", state: runState() }), [])).toEqual({ status: "failed", stepId: "elicit" });
    expect(runHeadline(waitingRun(), logged([{ type: "run-crashed", message: "boom" }]))).toEqual({ status: "crashed", message: "boom" });
    expect(runHeadline(runDetails(null), [])).toEqual({ status: "starting" });
    expect(runHeadline(runDetails({ status: "finished", state: runState() }), [])).toEqual({ status: "finished" });
  });
});
