import { describe, expect, it } from "vitest";
import { scanProject } from "../../src/application/scanProject";
import { FakeProjectFiles } from "../support/FakeProjectFiles";

const skillDoc = (path: string, description = "d") => ({ path, frontmatter: { description }, body: "" });

describe("scanProject", () => {
  it("sorts skills and agents by name and artefacts by path", async () => {
    const files = new FakeProjectFiles();
    files.skills = [skillDoc(".cursor/skills/zeta/SKILL.md"), skillDoc(".cursor/skills/alpha/SKILL.md")];
    files.agents = [skillDoc(".cursor/agents/writer.md"), skillDoc(".cursor/agents/analyst.md")];
    files.files = [{ path: "wiki/b.md", size: 1, mtimeMs: 0 }, { path: "discovery/a.md", size: 1, mtimeMs: 0 }];

    const registry = await scanProject(files);

    expect(registry.root).toBe("/host");
    expect(registry.skills.map((s) => s.name)).toEqual(["alpha", "zeta"]);
    expect(registry.agents.map((a) => a.name)).toEqual(["analyst", "writer"]);
    expect(registry.artefacts.map((a) => a.path)).toEqual(["discovery/a.md", "wiki/b.md"]);
    expect(registry.warnings).toEqual([]);
  });

  it("turns an unreadable doc into a warning and no entry", async () => {
    const files = new FakeProjectFiles();
    files.skills = [{ path: ".cursor/skills/bad/SKILL.md", error: "invalid YAML frontmatter: x" }];

    const registry = await scanProject(files);

    expect(registry.skills).toEqual([]);
    expect(registry.warnings).toEqual([
      { path: ".cursor/skills/bad/SKILL.md", message: "could not read: invalid YAML frontmatter: x" },
    ]);
  });

  it("keeps the first of two skills with the same name and warns about the second", async () => {
    const files = new FakeProjectFiles();
    files.skills = [skillDoc(".cursor/skills/req/SKILL.md", "first"), skillDoc(".agents/skills/req/SKILL.md", "second")];

    const registry = await scanProject(files);

    expect(registry.skills).toHaveLength(1);
    expect(registry.skills[0]?.description).toBe("first");
    expect(registry.warnings).toEqual([
      { path: ".agents/skills/req/SKILL.md", message: 'duplicate skill "req" (first: .cursor/skills/req/SKILL.md); ignored' },
    ]);
  });

  it("collects the warnings of the docs it keeps", async () => {
    const files = new FakeProjectFiles();
    files.agents = [{ path: ".cursor/agents/ba.md", frontmatter: {}, body: "" }];

    const registry = await scanProject(files);

    expect(registry.agents.map((a) => a.name)).toEqual(["ba"]);
    expect(registry.warnings).toEqual([{ path: ".cursor/agents/ba.md", message: "missing description" }]);
  });
});
