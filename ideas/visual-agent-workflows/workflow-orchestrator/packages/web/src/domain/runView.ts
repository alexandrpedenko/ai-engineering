import type { GateDecision, LoggedEvent, RunOutcome, RunState, Step, StepRecord, Workflow } from "@orch/core";
import { stepsInRunOrder } from "./workflowGraph";

// A run as the server describes it (GET /api/runs/:runId).
export type RunDetails = {
  runId: string;
  workflow: Workflow;
  inputs: Record<string, string>;
  startedAt: string;
  busy: boolean;
  outcome: RunOutcome | null; // null: saved, but the engine has no state yet
};

export type StepState = "pending" | "running" | "done" | "failed" | "waiting" | "approved" | "rejected";

export type StepView = {
  step: Step;
  state: StepState;
  attempt: number; // attempts so far, including one running now
  record?: StepRecord; // the latest finished attempt
  decisions: GateDecision[]; // gates only
  shows?: string[]; // a waiting gate: the files it asks the reviewer to read
};

export type RunHeadline = {
  status: RunOutcome["status"] | "starting" | "moving" | "crashed";
  gateId?: string;
  stepId?: string;
  message?: string; // a crash's message
};

// The outcome and whether the run is moving, from the details plus any newer
// events. A run moves from its first event after a "run-settled" or
// "run-crashed" until the next one.
function current(details: RunDetails, events: LoggedEvent[]) {
  let outcome = details.outcome;
  let crashed: string | undefined;
  let moving = details.busy;
  for (const { event } of events) {
    if (event.type === "run-settled") {
      outcome = event.outcome;
      crashed = undefined;
      moving = false;
    } else if (event.type === "run-crashed") {
      crashed = event.message;
      moving = false;
    } else {
      moving = true;
    }
  }
  return { outcome, crashed, moving };
}

// One row per step in the order the run takes them, from the run's state and its events.
export function stepTimeline(details: RunDetails, events: LoggedEvent[]): StepView[] {
  const { outcome, moving } = current(details, events);
  const state: Partial<RunState> = outcome?.state ?? {};
  const records = new Map<string, StepRecord>(Object.entries(state.steps ?? {}));
  const running = new Map<string, number>();
  for (const { event } of events) {
    if (event.type === "step-started") running.set(event.stepId, event.attempt);
    if (event.type === "step-finished") {
      running.delete(event.stepId);
      records.set(event.stepId, event.record);
    }
  }
  if (!moving) running.clear();

  return stepsInRunOrder(details.workflow).map((step) => {
    const record = records.get(step.id);
    const decisions = state.decisions?.[step.id] ?? [];
    const finished = record?.cursorRunIds.length ?? 0;
    const view: StepView = { step, state: "pending", attempt: running.get(step.id) ?? finished, decisions };
    if (record) view.record = record;

    if (step.type === "agent") {
      if (running.has(step.id)) view.state = "running";
      else if (record) view.state = record.status === "done" ? "done" : "failed";
    } else if (!moving && outcome?.status === "waiting" && outcome.gateId === step.id) {
      view.state = "waiting";
      view.shows = outcome.shows;
    } else if (!moving && outcome?.status === "rejected" && outcome.gateId === step.id) {
      view.state = "rejected";
    } else if (decisions.at(-1)?.decision === "approve") {
      view.state = "approved";
    } else if (decisions.length > 0) {
      view.state = "rejected";
    }
    return view;
  });
}

// Where the run stands, for the page header.
export function runHeadline(details: RunDetails, events: LoggedEvent[]): RunHeadline {
  const { outcome, crashed, moving } = current(details, events);
  if (moving) return { status: "moving" };
  if (crashed) return { status: "crashed", message: crashed };
  if (!outcome) return { status: "starting" };
  if (outcome.status === "waiting" || outcome.status === "rejected") return { status: outcome.status, gateId: outcome.gateId };
  if (outcome.status === "failed" || outcome.status === "interrupted") return { status: outcome.status, stepId: outcome.stepId };
  return { status: "finished" };
}
