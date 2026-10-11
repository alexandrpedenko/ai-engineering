import { describe, expect, it } from "vitest";
import { eventLine } from "../../src/domain/eventLines";

const agent = (event: object) => ({ seq: 7, at: "", event: { type: "agent-event", stepId: "elicit", event } }) as never;

describe("eventLine", () => {
  it("shows the first line of agent text", () => {
    expect(eventLine(agent({ kind: "text", text: "Reading the brief\nmore" }))).toEqual({ seq: 7, stepId: "elicit", text: "Reading the brief", tone: "text" });
  });

  it("shows running tools and failed tools, not finished ones", () => {
    expect(eventLine(agent({ kind: "tool", callId: "c", name: "edit", status: "running" }))?.text).toBe("edit");
    expect(eventLine(agent({ kind: "tool", callId: "c", name: "edit", status: "error" }))).toMatchObject({ text: "edit failed", tone: "error" });
    expect(eventLine(agent({ kind: "tool", callId: "c", name: "edit", status: "completed" }))).toBeNull();
  });

  it("leaves out thinking, status, empty text and run events", () => {
    expect(eventLine(agent({ kind: "thinking", text: "hm" }))).toBeNull();
    expect(eventLine(agent({ kind: "status", status: "RUNNING" }))).toBeNull();
    expect(eventLine(agent({ kind: "text", text: "  " }))).toBeNull();
    expect(eventLine({ seq: 1, at: "", event: { type: "step-started", stepId: "elicit", attempt: 1 } })).toBeNull();
  });
});
