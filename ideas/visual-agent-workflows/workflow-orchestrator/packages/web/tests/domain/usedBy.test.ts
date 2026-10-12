import type { WorkflowSummary } from "@orch/core";
import { describe, expect, it } from "vitest";
import { usedBy } from "../../src/domain/usedBy";

const summary = (id: string, name: string, agents: string[], skills: string[]): WorkflowSummary => ({ id, name, agents, skills, problems: [] });
const workflows = [
  summary("ux", "UX flows", ["designer"], ["user-flows"]),
  summary("ba", "BA discovery", ["business-analyst", "architect"], ["requirements-elicitation", "user-flows"]),
];

describe("usedBy", () => {
  it("lists the workflows using a skill or an agent, by name", () => {
    expect(usedBy({ kind: "skill", name: "user-flows" }, workflows)).toEqual([
      { id: "ba", name: "BA discovery" },
      { id: "ux", name: "UX flows" },
    ]);
    expect(usedBy({ kind: "agent", name: "designer" }, workflows)).toEqual([{ id: "ux", name: "UX flows" }]);
    expect(usedBy({ kind: "skill", name: "unused" }, workflows)).toEqual([]);
  });

  it("tracks no use of artefacts or other files", () => {
    expect(usedBy({ kind: "artefact" }, workflows)).toEqual([]);
  });
});
