// Keeps docs/architecture true to the code: every doc has the frontmatter
// the README describes, every path it names exists, every source file is
// described by some doc, and the areas it points to exist.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import picomatch from "picomatch";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = join(root, "docs/architecture");

type Doc = {
  file: string;
  title: string;
  area: string;
  summary: string;
  code: string[];
  depends_on: string[];
  used_by: string[];
  adrs: number[];
  specs: string[];
  updated: string;
};

// The YAML between the first two "---" lines of a markdown file.
export function frontmatterOf(text: string): unknown {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  return match ? parse(match[1] ?? "") : null;
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === ".data" || entry.name === "dist") return [];
    const full = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [relative(root, full)];
  });
}

const docs: Doc[] = readdirSync(docsDir)
  .filter((name) => name.endsWith(".md"))
  .map((name) => ({ file: name, ...(frontmatterOf(readFileSync(join(docsDir, name), "utf8")) as Omit<Doc, "file">) }));
const areas = new Set(docs.map((d) => d.area));
const allFiles = filesUnder(root);
const sourceFiles = allFiles.filter((f) => /^packages\/[^/]+\/src\//.test(f));
const matches = (pattern: string) => picomatch(pattern, { dot: true });

describe("architecture docs", () => {
  it("each has the full frontmatter, and its area is its file name", () => {
    for (const doc of docs) {
      expect(doc, doc.file).toMatchObject({ title: expect.any(String), summary: expect.any(String), updated: expect.any(String) });
      for (const key of ["code", "depends_on", "used_by", "adrs", "specs"] as const) expect(Array.isArray(doc[key]), `${doc.file}: ${key}`).toBe(true);
      expect(doc.area).toBe(doc.file === "README.md" ? "overview" : doc.file.replace(/\.md$/, ""));
    }
  });

  it("names only paths that exist", () => {
    const missing = docs.flatMap((doc) => doc.code.filter((pattern) => {
      const isMatch = matches(pattern);
      return !allFiles.some((file) => isMatch(file));
    }).map((p) => `${doc.file}: ${p}`));
    expect(missing).toEqual([]);
  });

  it("describes every source file", () => {
    const patterns = docs.flatMap((doc) => doc.code).map(matches);
    expect(sourceFiles.filter((file) => !patterns.some((m) => m(file)))).toEqual([]);
  });

  it("points only to areas that exist", () => {
    const unknown = docs.flatMap((doc) => [...doc.depends_on, ...doc.used_by].filter((a) => !areas.has(a)).map((a) => `${doc.file}: ${a}`));
    expect(unknown).toEqual([]);
  });

  it("names ADRs and specs that exist, when the docs folder next to the orchestrator is there", () => {
    const adrDir = join(root, "../adr");
    const specDir = join(root, "../specs");
    if (!existsSync(adrDir) || !existsSync(specDir)) return;
    const adrs = readdirSync(adrDir);
    const specs = readdirSync(specDir).map((name) => name.replace(/\.md$/, ""));
    const wrong = docs.flatMap((doc) => [
      ...doc.adrs.filter((n) => !adrs.some((name) => name.startsWith(String(n).padStart(4, "0")))).map((n) => `${doc.file}: ADR ${n}`),
      ...doc.specs.filter((s) => !specs.includes(s)).map((s) => `${doc.file}: spec ${s}`),
    ]);
    expect(wrong).toEqual([]);
  });

  it("reads frontmatter, and nothing when there is none", () => {
    expect(frontmatterOf("---\ntitle: X\ncode: [a]\n---\n# X")).toEqual({ title: "X", code: ["a"] });
    expect(frontmatterOf("# no frontmatter")).toBeNull();
  });
});
