import { describe, expect, it } from "vitest";
import { fileKind } from "../../src/domain/fileKind";
import { registry } from "../support/sampleData";

describe("fileKind", () => {
  it("names a skill, an agent, an artefact or another file", () => {
    expect(fileKind(".cursor/skills/requirements-elicitation/SKILL.md", registry)).toEqual({ kind: "skill", name: "requirements-elicitation" });
    expect(fileKind(".cursor/agents/architect.md", registry)).toEqual({ kind: "agent", name: "architect" });
    expect(fileKind("discovery/brief.md", registry)).toEqual({ kind: "artefact" });
    expect(fileKind("src/index.ts", registry)).toEqual({ kind: "other" });
  });
});
