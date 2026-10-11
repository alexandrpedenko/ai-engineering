import type { LoggedEvent } from "@orch/core";

export type FeedLine = { seq: number; stepId: string; text: string; tone: "text" | "tool" | "error" };

const firstLine = (text: string) => {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > 160 ? `${line.slice(0, 159)}…` : line;
};

// The line the live feed shows for an agent event, or null for events the
// feed leaves out (thinking, finished tool calls, status, run events).
export function eventLine(logged: LoggedEvent): FeedLine | null {
  const { event } = logged;
  if (event.type !== "agent-event") return null;
  const e = event.event;
  if (e.kind === "text" && firstLine(e.text)) return { seq: logged.seq, stepId: event.stepId, text: firstLine(e.text), tone: "text" };
  if (e.kind === "tool" && e.status === "running") return { seq: logged.seq, stepId: event.stepId, text: e.name, tone: "tool" };
  if (e.kind === "tool" && e.status === "error") return { seq: logged.seq, stepId: event.stepId, text: `${e.name} failed`, tone: "error" };
  return null;
}
