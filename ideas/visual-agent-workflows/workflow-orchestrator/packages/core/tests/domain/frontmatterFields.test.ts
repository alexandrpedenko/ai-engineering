import { describe, expect, it } from "vitest";
import { frontmatterFields, stringField } from "../../src/domain/frontmatterFields";

describe("frontmatterFields", () => {
  it("returns a mapping as fields", () => {
    const result = frontmatterFields({ path: "a.md", frontmatter: { name: "x" }, body: "" });
    expect(result).toEqual({ fields: { name: "x" }, warnings: [] });
  });

  it.each([["a string", "just text"], ["a list", ["a", "b"]], ["null", null]])("warns when frontmatter is %s", (_, frontmatter) => {
    const result = frontmatterFields({ path: "a.md", frontmatter, body: "" });
    expect(result.fields).toEqual({});
    expect(result.warnings).toEqual([{ path: "a.md", message: "frontmatter is not a key: value mapping" }]);
  });
});

describe("stringField", () => {
  it("trims strings and ignores empty or non-string values", () => {
    const fields = { a: "  hi ", b: "   ", c: 3 };
    expect(stringField(fields, "a")).toBe("hi");
    expect(stringField(fields, "b")).toBeUndefined();
    expect(stringField(fields, "c")).toBeUndefined();
    expect(stringField(fields, "missing")).toBeUndefined();
  });
});
