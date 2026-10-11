import type { RunOutcome, StepRecord } from "@orch/core";
import { describe, expect, it } from "vitest";
import { formatOutcome, formatRunEvent } from "../../src/cli/formatRunEvent";

const record = (over: Partial<StepRecord> = {}): StepRecord => ({
  status: "done",
  cursorRunIds: ["r1"],
  writes: [{ path: "discovery/requirements.md", change: "created" }],
  missing: [],
  summary: "Wrote it",
  durationMs: 42_300,
  ...over,
});

describe("formatRunEvent", () => {
  it("shows a step starting with its attempt", () => {
    expect(formatRunEvent({ type: "step-started", stepId: "elicit", attempt: 2 })).toBe("▸ elicit (attempt 2)\n");
  });

  it("shows the first line of agent text, running tools and failed tools; hides the rest", () => {
    const text = (t: string) => formatRunEvent({ type: "agent-event", stepId: "s", event: { kind: "text", text: t } });
    const tool = (status: "running" | "completed" | "error") =>
      formatRunEvent({ type: "agent-event", stepId: "s", event: { kind: "tool", callId: "c", name: "edit", status } });

    expect(text("Reading the brief\nand more")).toBe("  · Reading the brief\n");
    expect(text("x".repeat(150))).toBe(`  · ${"x".repeat(99)}…\n`);
    expect(tool("running")).toBe("  · edit\n");
    expect(tool("completed")).toBe("");
    expect(tool("error")).toBe("  ! edit failed\n");
    expect(formatRunEvent({ type: "agent-event", stepId: "s", event: { kind: "thinking", text: "hm" } })).toBe("");
  });

  it("shows a finished step with time, tokens and file changes", () => {
    const event = { type: "step-finished" as const, stepId: "elicit", record: record({ usage: { inputTokens: 12_400, outputTokens: 950 }, missing: ["discovery/glossary.md"] }) };
    expect(formatRunEvent(event)).toBe(
      "✓ elicit  42 s  12.4k in / 950 out\n    created  discovery/requirements.md\n    missing  discovery/glossary.md (declared, not written)\n",
    );
  });

  it("shows a failed step with its summary", () => {
    const event = { type: "step-finished" as const, stepId: "elicit", record: record({ status: "failed", writes: [], summary: "rate limited\nretry later" }) };
    expect(formatRunEvent(event)).toBe("✗ elicit failed: rate limited\n");
  });

  it("lists the files a gate shows", () => {
    expect(formatRunEvent({ type: "gate-waiting", gateId: "review", shows: ["a.md", "b.md"] })).toBe("\n◆ review: check these files:\n    a.md\n    b.md\n");
  });
});

describe("formatOutcome", () => {
  const outcome = (o: object) => ({ state: {}, ...o }) as RunOutcome;

  it("says where the run ended and how to carry on", () => {
    expect(formatOutcome("run-1", outcome({ status: "finished" }))).toBe("finished  run-1\n");
    expect(formatOutcome("run-1", outcome({ status: "waiting", gateId: "review", shows: [] }))).toBe(
      "stopped at review. Continue with: npm run wf -- continue run-1\n",
    );
    expect(formatOutcome("run-1", outcome({ status: "interrupted", stepId: "design" }))).toBe(
      "interrupted inside design. Continue with: npm run wf -- continue run-1\n",
    );
    expect(formatOutcome("run-1", outcome({ status: "failed", stepId: "elicit" }))).toBe("failed at elicit  run-1\n");
    expect(formatOutcome("run-1", outcome({ status: "rejected", gateId: "review" }))).toBe("rejected at review: no revisions left  run-1\n");
  });
});
