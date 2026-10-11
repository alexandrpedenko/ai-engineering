// Checks the layer rules of ADR-0010 / AGENTS.md: every source file belongs to
// a known layer, and every import points to a layer or package that layer may
// use. Reads files as text; does not run or type-check them.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type Layer =
  | "core/domain" | "core/application" | "core/infrastructure" | "core/index"
  | "server/routes" | "server/cli" | "server/composition" | "server/bin"
  | "web/domain" | "web/application" | "web/api" | "web/components" | "web/pages" | "web/bootstrap";

const coreTypes = "@orch/core";
const uiLibs = ["react", "react/*", "@mui/*", "@emotion/*", "@xyflow/react", "@xyflow/react/*", "@monaco-editor/react"];

// For each layer: the layers it may import from, and the packages it may use.
// "*" allows any package. "@orch/core" in web is allowed only as `import type`.
const rules: Record<Layer, { layers: Layer[]; packages: string[] }> = {
  "core/domain": { layers: ["core/domain"], packages: ["zod"] },
  "core/application": { layers: ["core/domain", "core/application"], packages: ["zod"] },
  "core/infrastructure": { layers: ["core/domain", "core/application", "core/infrastructure"], packages: ["*"] },
  "core/index": { layers: ["core/domain", "core/application"], packages: [] },
  "server/routes": { layers: ["server/routes", "core/index"], packages: ["hono", "hono/*", "zod"] },
  "server/cli": { layers: ["server/cli", "core/index"], packages: [] },
  "server/composition": {
    layers: ["server/routes", "server/composition", "core/index", "core/infrastructure"],
    packages: ["*"],
  },
  "server/bin": {
    layers: ["server/routes", "server/cli", "server/composition", "server/bin", "core/index", "core/infrastructure"],
    packages: ["*"],
  },
  "web/domain": { layers: ["web/domain"], packages: ["zod", coreTypes] },
  "web/application": {
    layers: ["web/domain", "web/application"],
    packages: ["react", "@tanstack/react-query", "zustand", "zustand/*", coreTypes],
  },
  "web/api": { layers: ["web/domain", "web/application", "web/api"], packages: ["zod", coreTypes] },
  "web/components": { layers: ["web/domain", "web/components"], packages: [...uiLibs, coreTypes] },
  "web/pages": {
    layers: ["web/domain", "web/application", "web/components", "web/pages"],
    packages: [...uiLibs, coreTypes],
  },
  "web/bootstrap": {
    layers: ["web/domain", "web/application", "web/api", "web/components", "web/pages", "web/bootstrap"],
    packages: ["*"],
  },
};

// The layer of a path relative to the orchestrator root, or null if the file
// is in no known layer.
export function layerOf(path: string): Layer | null {
  const m = path.match(/^packages\/(core|server|web)\/src\/(.+)$/);
  if (!m) return null;
  const [, pkg, rest] = m as unknown as [string, string, string];
  if (pkg === "core") {
    if (rest === "index.ts") return "core/index";
    const dir = rest.split("/")[0];
    if (dir === "domain" || dir === "application" || dir === "infrastructure") return `core/${dir}`;
    return null;
  }
  if (pkg === "server") {
    if (rest === "main.ts" || rest === "composition.ts") return "server/composition";
    if (rest.startsWith("routes/")) return "server/routes";
    if (rest.startsWith("cli/")) return "server/cli";
    if (rest.startsWith("bin/")) return "server/bin";
    return null;
  }
  const dir = rest.split("/")[0];
  const webLayers = ["domain", "application", "api", "components", "pages", "bootstrap"];
  return dir && webLayers.includes(dir) ? (`web/${dir}` as Layer) : null;
}

type Import = { spec: string; typeOnly: boolean };

// Every module specifier in a file: static imports, re-exports, side-effect
// imports and dynamic import(). Does not see imports built from strings.
export function importsOf(source: string): Import[] {
  const found: Import[] = [];
  const fromRe = /^\s*(import|export)(\s+type)?\b[^;]*?\bfrom\s*["']([^"']+)["']/gm;
  const bareRe = /^\s*import\s*["']([^"']+)["']/gm;
  const dynamicRe = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of source.matchAll(fromRe)) found.push({ spec: m[3]!, typeOnly: Boolean(m[2]) });
  for (const m of source.matchAll(bareRe)) found.push({ spec: m[1]!, typeOnly: false });
  for (const m of source.matchAll(dynamicRe)) found.push({ spec: m[1]!, typeOnly: false });
  return found;
}

const allowsPackage = (patterns: string[], spec: string) =>
  patterns.some(
    (p) => p === "*" || p === spec || (p.endsWith("/*") && spec.startsWith(p.slice(0, -1))),
  );

// Why `imp` in a file of layer `from` (at `path`) breaks the rules, or null if it's allowed.
export function violation(from: Layer, path: string, imp: Import): string | null {
  const rule = rules[from];
  if (imp.spec.startsWith(".")) {
    const target = relative(root, resolve(root, dirname(path), imp.spec));
    const targetLayer = layerOf(target) ?? layerOf(`${target}.ts`);
    if (!targetLayer) return `imports ${imp.spec}, which is in no layer`;
    return rule.layers.includes(targetLayer) ? null : `${from} may not import ${targetLayer} (${imp.spec})`;
  }
  if (imp.spec === "@orch/core/infrastructure") {
    return rule.layers.includes("core/infrastructure") ? null : `${from} may not import ${imp.spec}`;
  }
  if (imp.spec === coreTypes) {
    if (from.startsWith("web/") && !imp.typeOnly) {
      return `${from} may import @orch/core with \`import type\` only`;
    }
    const ok = rule.layers.includes("core/index") || allowsPackage(rule.packages, imp.spec);
    return ok ? null : `${from} may not import ${imp.spec}`;
  }
  if (imp.spec.startsWith("node:") && (from === "core/domain" || from === "core/application")) {
    return `${from} may not use ${imp.spec}; go through a port`;
  }
  if (imp.spec.startsWith("node:") && rule.packages.includes("*")) return null;
  return allowsPackage(rule.packages, imp.spec) ? null : `${from} may not use package ${imp.spec}`;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const files = ["core", "server", "web"].flatMap((pkg) =>
  sourceFiles(join(root, "packages", pkg, "src")).map((f) => relative(root, f)),
);

describe("architecture", () => {
  it("puts every source file in a layer", () => {
    expect(files.filter((f) => layerOf(f) === null)).toEqual([]);
  });

  it("only imports inward and only allowed packages", () => {
    const problems = files.flatMap((path) => {
      const layer = layerOf(path);
      if (!layer) return [];
      return importsOf(readFileSync(join(root, path), "utf8"))
        .map((imp) => violation(layer, path, imp))
        .filter((p): p is string => p !== null)
        .map((p) => `${path}: ${p}`);
    });
    expect(problems).toEqual([]);
  });

  it("catches the imports it is meant to catch", () => {
    const component = "packages/web/src/components/X.tsx";
    expect(violation("web/components", component, { spec: "../api/HttpOrchestratorApi", typeOnly: false })).toMatch(/may not import web\/api/);
    expect(violation("web/components", component, { spec: "../application/useServerStatus", typeOnly: false })).toMatch(/web\/application/);
    expect(violation("web/pages", "packages/web/src/pages/P.tsx", { spec: "@orch/core", typeOnly: false })).toMatch(/import type/);
    expect(violation("core/domain", "packages/core/src/domain/w.ts", { spec: "node:fs", typeOnly: false })).toMatch(/port/);
    expect(violation("core/domain", "packages/core/src/domain/w.ts", { spec: "../infrastructure/fs", typeOnly: false })).toMatch(/core\/infrastructure/);
    expect(violation("core/application", "packages/core/src/application/a.ts", { spec: "@cursor/sdk", typeOnly: false })).toMatch(/package/);
    expect(violation("web/pages", "packages/web/src/pages/P.tsx", { spec: "../application/useServerStatus", typeOnly: false })).toBeNull();
  });

  it("reads type-only, multi-line and side-effect imports", () => {
    const src = `import type { A } from "./a";\nimport {\n  b,\n  c,\n} from "./b";\nimport "./style.css";\nexport { d } from "./d";\nconst e = import("./e");`;
    expect(importsOf(src).map((i) => `${i.spec}${i.typeOnly ? ":type" : ""}`).sort()).toEqual(
      ["./a:type", "./b", "./d", "./e", "./style.css"],
    );
  });
});
