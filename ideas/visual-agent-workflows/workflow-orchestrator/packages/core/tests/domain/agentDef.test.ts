import { describe, expect, it } from "vitest";
import { toAgentDef } from "../../src/domain/agentDef";

const doc = (frontmatter: unknown, path = ".cursor/agents/business-analyst.md") => ({ path, frontmatter, body: "  You are a BA.\n" });

describe("toAgentDef", () => {
  it("takes the name from the frontmatter", () => {
    const { agent, warnings } = toAgentDef(doc({ name: "ba", description: "Analyst." }));
    expect(agent).toEqual({ name: "ba", path: ".cursor/agents/business-analyst.md", description: "Analyst.", body: "You are a BA." });
    expect(warnings).toEqual([]);
  });

  it("falls back to the file name", () => {
    expect(toAgentDef(doc({ description: "d" })).agent.name).toBe("business-analyst");
  });

  it("keeps model only when it is a string", () => {
    expect(toAgentDef(doc({ description: "d", model: "inherit" })).agent.model).toBe("inherit");
    expect(toAgentDef(doc({ description: "d", model: 5 })).agent).not.toHaveProperty("model");
  });

  it("warns about a missing description", () => {
    expect(toAgentDef(doc({ name: "ba" })).warnings).toEqual([
      { path: ".cursor/agents/business-analyst.md", message: "missing description" },
    ]);
  });
});
