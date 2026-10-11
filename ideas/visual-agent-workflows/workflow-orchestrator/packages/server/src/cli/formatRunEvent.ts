import type { RunEvent, RunOutcome, StepRecord } from "@orch/core";

const firstLine = (text: string, max = 100) => {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

const tokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

function recordLines(record: StepRecord): string[] {
  const lines = record.writes.map((w) => `    ${w.change.padEnd(9)}${w.path}`);
  for (const path of record.missing) lines.push(`    missing  ${path} (declared, not written)`);
  return lines;
}

// One run event as terminal lines (with a trailing newline), or "" for events
// not worth showing (thinking, finished tool calls, status changes).
export function formatRunEvent(event: RunEvent): string {
  switch (event.type) {
    case "step-started":
      return `▸ ${event.stepId} (attempt ${event.attempt})\n`;
    case "agent-event": {
      const e = event.event;
      if (e.kind === "text" && firstLine(e.text)) return `  · ${firstLine(e.text)}\n`;
      if (e.kind === "tool" && e.status === "running") return `  · ${e.name}\n`;
      if (e.kind === "tool" && e.status === "error") return `  ! ${e.name} failed\n`;
      return "";
    }
    case "step-finished": {
      const r = event.record;
      if (r.status === "failed") return [`✗ ${event.stepId} failed: ${firstLine(r.summary, 200)}`, ...recordLines(r), ""].join("\n");
      const seconds = `${Math.round(r.durationMs / 1000)} s`;
      const usage = r.usage ? `  ${tokens(r.usage.inputTokens)} in / ${tokens(r.usage.outputTokens)} out` : "";
      return [`✓ ${event.stepId}  ${seconds}${usage}`, ...recordLines(r), ""].join("\n");
    }
    case "gate-waiting":
      return ["", `◆ ${event.gateId}: check these files:`, ...event.shows.map((p) => `    ${p}`), ""].join("\n");
  }
}

// Where a run ended up, with the command to carry on when there is one.
export function formatOutcome(runId: string, outcome: RunOutcome): string {
  const carryOn = `npm run wf -- continue ${runId}`;
  switch (outcome.status) {
    case "finished":
      return `finished  ${runId}\n`;
    case "waiting":
      return `stopped at ${outcome.gateId}. Continue with: ${carryOn}\n`;
    case "interrupted":
      return `interrupted inside ${outcome.stepId}. Continue with: ${carryOn}\n`;
    case "failed":
      return `failed at ${outcome.stepId}  ${runId}. Retry with: npm run wf -- retry ${runId}\n`;
    case "rejected":
      return `rejected at ${outcome.gateId}: no revisions left  ${runId}\n`;
  }
}
