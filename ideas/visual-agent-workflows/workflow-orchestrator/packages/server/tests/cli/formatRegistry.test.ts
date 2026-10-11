import type { Registry } from "@orch/core";
import { describe, expect, it } from "vitest";
import { formatRegistry } from "../../src/cli/formatRegistry";

const registry: Registry = {
  root: "/host",
  skills: [{ name: "req", path: ".cursor/skills/req/SKILL.md", description: "Write requirements.", body: "" }],
  agents: [
    { name: "architect", path: ".cursor/agents/architect.md", description: "Designs.", model: "inherit", body: "" },
    { name: "ba", path: ".cursor/agents/ba.md", description: "", body: "" },
  ],
  artefacts: [{ path: "discovery/brief.md", size: 1126, mtimeMs: 0 }],
  warnings: [{ path: ".cursor/agents/ba.md", message: "missing description" }],
};

describe("formatRegistry", () => {
  it("lays the registry out in sections", () => {
    expect(formatRegistry(registry)).toBe(
      [
        "project    /host",
        "",
        "skills (1)",
        "  req        .cursor/skills/req/SKILL.md",
        "             Write requirements.",
        "",
        "agents (2)",
        "  architect  .cursor/agents/architect.md  model: inherit",
        "             Designs.",
        "  ba         .cursor/agents/ba.md",
        "",
        "artefacts (1)",
        "  discovery/brief.md  1.1 kB",
        "",
        "warnings (1)",
        "  .cursor/agents/ba.md  missing description",
        "",
      ].join("\n"),
    );
  });

  it("prints empty sections with a zero count", () => {
    const text = formatRegistry({ root: "/host", skills: [], agents: [], artefacts: [], warnings: [] });
    expect(text).toContain("skills (0)\n\nagents (0)\n\nartefacts (0)\n\nwarnings (0)\n");
  });
});
