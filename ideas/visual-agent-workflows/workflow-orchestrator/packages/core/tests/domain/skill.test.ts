import { describe, expect, it } from "vitest";
import { toSkill } from "../../src/domain/skill";

const doc = (path: string, frontmatter: unknown, body = "\n# Body\n") => ({ path, frontmatter, body });

describe("toSkill", () => {
  it("names the skill after the folder holding SKILL.md", () => {
    const { skill, warnings } = toSkill(doc(".cursor/skills/req/SKILL.md", { name: "req", description: "Write requirements." }));
    expect(skill).toEqual({ name: "req", path: ".cursor/skills/req/SKILL.md", description: "Write requirements.", body: "# Body" });
    expect(warnings).toEqual([]);
  });

  it("ignores category folders above the skill folder", () => {
    const { skill } = toSkill(doc(".agents/skills/discovery/arch-review/SKILL.md", { description: "d" }));
    expect(skill.name).toBe("arch-review");
  });

  it("warns about a missing description and keeps the skill", () => {
    const { skill, warnings } = toSkill(doc(".cursor/skills/req/SKILL.md", {}));
    expect(skill.description).toBe("");
    expect(warnings).toEqual([{ path: ".cursor/skills/req/SKILL.md", message: "missing description" }]);
  });

  it("uses the folder name when the frontmatter name differs", () => {
    const { skill, warnings } = toSkill(doc(".cursor/skills/req/SKILL.md", { name: "requirements", description: "d" }));
    expect(skill.name).toBe("req");
    expect(warnings[0]?.message).toBe('name "requirements" differs from folder "req"; using "req"');
  });

  it("treats a non-mapping frontmatter as empty", () => {
    const { warnings } = toSkill(doc(".cursor/skills/req/SKILL.md", "oops"));
    expect(warnings.map((w) => w.message)).toEqual(["frontmatter is not a key: value mapping", "missing description"]);
  });
});
