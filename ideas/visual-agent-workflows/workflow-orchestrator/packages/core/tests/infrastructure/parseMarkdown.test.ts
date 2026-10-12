import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../../src/infrastructure/parseMarkdown";

describe("parseMarkdown", () => {
  it("returns an empty frontmatter when there is none", () => {
    expect(parseMarkdown("a.md", "# Title\n")).toEqual({ path: "a.md", frontmatter: {}, body: "# Title\n" });
  });

  it("splits valid frontmatter from the body", () => {
    const doc = parseMarkdown("a.md", "---\nname: x\nmodel: inherit\n---\n\nBody\n");
    expect(doc).toEqual({ path: "a.md", frontmatter: { name: "x", model: "inherit" }, body: "\nBody\n" });
  });

  it("treats an empty frontmatter block as {}", () => {
    expect(parseMarkdown("a.md", "---\n---\nBody")).toEqual({ path: "a.md", frontmatter: {}, body: "Body" });
  });

  it("reports invalid YAML", () => {
    const doc = parseMarkdown("a.md", "---\nname: [unclosed\n---\nBody");
    expect(doc).toMatchObject({ path: "a.md", error: expect.stringMatching(/^invalid YAML frontmatter: /) });
  });

  it("reports a frontmatter block that never closes", () => {
    expect(parseMarkdown("a.md", "---\nname: x\nBody")).toEqual({ path: "a.md", error: "frontmatter has no closing ---" });
  });

  it("handles Windows line endings", () => {
    const doc = parseMarkdown("a.md", "---\r\nname: x\r\n---\r\nBody\r\n");
    expect(doc).toEqual({ path: "a.md", frontmatter: { name: "x" }, body: "Body\n" });
  });
});
