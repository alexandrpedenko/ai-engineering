import { type LoggedEvent, type LogEvent, type Registry, type RunOutcome, type RunState, type StepRecord, Workflow } from "@orch/core";
import type { RunDetails } from "../../src/domain/runView";

export const registry: Registry = {
  root: "/projects/sample-project",
  skills: [{ name: "requirements-elicitation", path: ".cursor/skills/requirements-elicitation/SKILL.md", description: "Write requirements.", body: "" }],
  agents: [
    { name: "business-analyst", path: ".cursor/agents/business-analyst.md", description: "Analyst.", body: "" },
    { name: "architect", path: ".cursor/agents/architect.md", description: "Architect.", model: "inherit", body: "" },
  ],
  artefacts: [{ path: "discovery/brief.md", size: 1126, mtimeMs: 0 }],
  warnings: [],
};

export const workflow: Workflow = Workflow.parse({
  schema: 1,
  id: "ba-discovery",
  name: "BA discovery",
  phase: "discovery",
  inputs: [{ id: "focus", label: "What to focus on", type: "text" }],
  steps: [
    { id: "elicit", type: "agent", label: "Write requirements", agent: "business-analyst", skills: ["requirements-elicitation"], instructions: "x", writes: ["discovery/requirements.md"] },
    { id: "review", type: "gate", label: "Review requirements", shows: ["discovery/requirements.md"], onReject: "elicit" },
    { id: "design", type: "agent", label: "Sketch the design", agent: "architect", instructions: "y", writes: ["discovery/design.md"] },
  ],
  edges: [
    { from: "elicit", to: "review" },
    { from: "review", to: "design" },
  ],
});

export const record = (over: Partial<StepRecord> = {}): StepRecord => ({
  status: "done",
  cursorRunIds: ["a1"],
  writes: [{ path: "discovery/requirements.md", change: "created" }],
  missing: [],
  summary: "Wrote it",
  durationMs: 41_000,
  ...over,
});

export const runState = (over: Partial<RunState> = {}): RunState => ({
  workflowId: "ba-discovery",
  inputs: {},
  steps: {},
  feedback: {},
  decisions: {},
  revisions: {},
  stoppedAt: null,
  ...over,
});

// A run as GET /api/runs/:runId returns it.
export const runDetails = (outcome: RunOutcome | null, over: Partial<RunDetails> = {}): RunDetails => ({
  runId: "run-1",
  workflow,
  inputs: { focus: "pricing" },
  startedAt: "2026-10-11T12:00:00.000Z",
  busy: false,
  outcome,
  ...over,
});

export const waitingRun = () =>
  runDetails({ status: "waiting", gateId: "review", shows: ["discovery/requirements.md"], state: runState({ steps: { elicit: record() } }) });

// Numbered events, starting at `from`.
export const logged = (events: LogEvent[], from = 1): LoggedEvent[] => events.map((event, i) => ({ seq: from + i, at: "", event }));
