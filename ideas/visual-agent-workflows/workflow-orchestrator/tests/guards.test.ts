// Development guards from AGENTS.md that a type check can't see:
// promise chains are not used, and every unit with behaviour has a test file.
// Reads files as text; does not run them.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function filesUnder(dir: string, pattern: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(full, pattern);
    return pattern.test(entry.name) ? [relative(root, full)] : [];
  });
}

const packages = ["core", "server", "web"];
const code = packages.flatMap((pkg) => [
  ...filesUnder(join(root, "packages", pkg, "src"), /\.tsx?$/),
  ...filesUnder(join(root, "packages", pkg, "tests"), /\.tsx?$/),
]);

// `.then(` / `.catch(` / `.finally(` calls. A `catch (e)` block of try/catch
// is not matched.
export function promiseChainsIn(source: string): string[] {
  return [...source.matchAll(/\.(then|catch|finally)\s*\(/g)].map((m) => `.${m[1]}()`);
}

// Folders whose files must each have a test file at the mirrored path under
// tests/. Components are covered through the pages that use them; app/ and
// composition are covered by page and route tests.
const mustBeTested = [
  "packages/core/src/domain",
  "packages/core/src/application",
  "packages/core/src/infrastructure",
  "packages/server/src/routes",
  "packages/web/src/domain",
  "packages/web/src/application",
  "packages/web/src/api",
  "packages/web/src/pages",
];

// True when a file exports behaviour: a function, a class, or a const holding
// a function. Files exporting only types, interfaces or plain data (query
// keys, theme objects) need no test of their own.
export function hasRuntimeExport(source: string): boolean {
  return (
    /^export\s+(async\s+)?(function|class)\b/m.test(source) ||
    /^export\s+const\s+\w+(\s*:[^=]+)?\s*=\s*(async\s*)?(\(|function\b|\w+\s*=>)/m.test(source)
  );
}

export function expectedTestFiles(srcFile: string): string[] {
  const base = srcFile.replace("/src/", "/tests/").replace(/\.tsx?$/, "");
  return [`${base}.test.ts`, `${base}.test.tsx`];
}

describe("guards", () => {
  it("uses async/await, never .then/.catch/.finally chains", () => {
    const problems = code.flatMap((file) =>
      promiseChainsIn(readFileSync(join(root, file), "utf8")).map((call) => `${file}: ${call}`),
    );
    expect(problems).toEqual([]);
  });

  it("has a test file for every unit with behaviour", () => {
    const untested = mustBeTested
      .flatMap((dir) => filesUnder(join(root, dir), /\.tsx?$/))
      .filter((file) => hasRuntimeExport(readFileSync(join(root, file), "utf8")))
      .filter((file) => !expectedTestFiles(file).some((t) => existsSync(join(root, t))));
    expect(untested).toEqual([]);
  });

  it("catches what it is meant to catch", () => {
    expect(promiseChainsIn("api.isServerUp().then((up) => up).catch(() => false)")).toEqual([".then()", ".catch()"]);
    expect(promiseChainsIn("try { await x(); } catch (error) { log(error); }")).toEqual([]);
    expect(hasRuntimeExport("export interface A {}\nexport type B = string;")).toBe(false);
    expect(hasRuntimeExport("export async function load() {}")).toBe(true);
    expect(hasRuntimeExport("export const load = async (id: string) => id;")).toBe(true);
    expect(hasRuntimeExport('export const keys = { health: ["health"] as const };')).toBe(false);
    expect(expectedTestFiles("packages/web/src/pages/HomePage.tsx")).toContain("packages/web/tests/pages/HomePage.test.tsx");
  });
});
