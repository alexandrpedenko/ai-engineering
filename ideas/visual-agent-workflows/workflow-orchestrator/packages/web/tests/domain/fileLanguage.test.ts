import { describe, expect, it } from "vitest";
import { languageOf } from "../../src/domain/fileLanguage";

describe("languageOf", () => {
  it.each([
    [".cursor/skills/x/SKILL.md", "markdown"],
    ["docs/page.MDX", "markdown"],
    [".cursor/workflows/ba.json", "json"],
    ["src/index.ts", "typescript"],
    ["config/app.yml", "yaml"],
    ["notes.txt", "plaintext"],
    ["Makefile", "plaintext"],
    [".env.example", "plaintext"],
  ])("%s → %s", (path, language) => {
    expect(languageOf(path)).toBe(language);
  });
});
