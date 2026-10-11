import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OrchestratorConfig, type ResolvedConfig } from "../../src/domain/config";
import { FsProjectFiles } from "../../src/infrastructure/FsProjectFiles";
import { copyOfSampleProject, orchestratorDir, sampleProject } from "../support/paths";

function configFor(projectRoot: string, overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return { ...OrchestratorConfig.parse({}), orchestratorDir, projectRoot, dataDir: join(orchestratorDir, ".data"), ...overrides };
}

const temps: string[] = [];
afterEach(async () => {
  await Promise.all(temps.splice(0).map(async (dir) => await rm(dir, { recursive: true, force: true })));
});

describe("FsProjectFiles on the sample project", () => {
  const files = new FsProjectFiles(configFor(sampleProject));

  it("reads skills in skill-folder order, including category folders", async () => {
    const docs = await files.skillDocs();
    expect(docs.map((d) => d.path)).toEqual([
      ".cursor/skills/requirements-elicitation/SKILL.md",
      ".agents/skills/discovery/architecture-review/SKILL.md",
    ]);
    expect(docs[0]).toMatchObject({ frontmatter: { name: "requirements-elicitation" } });
  });

  it("reads agents directly inside the agent folder", async () => {
    const docs = await files.agentDocs();
    expect(docs.map((d) => d.path)).toEqual([".cursor/agents/architect.md", ".cursor/agents/business-analyst.md"]);
  });

  it("lists artefacts matching the globs only", async () => {
    const artefacts = await files.artefacts();
    expect(artefacts.map((a) => a.path)).toEqual(["discovery/brief.md", "wiki/README.md"]);
    expect(artefacts[0]?.size).toBeGreaterThan(0);
  });
});

describe("FsProjectFiles.snapshot", () => {
  it("hashes the matching files and records what each pattern matched", async () => {
    const root = await copyOfSampleProject();
    temps.push(root);
    const files = new FsProjectFiles(configFor(root));

    const before = await files.snapshot(["discovery/**", "discovery/requirements.md"]);
    await writeFile(join(root, "discovery/brief.md"), "changed");
    const after = await files.snapshot(["discovery/**"]);

    expect(before.matches).toEqual({ "discovery/**": ["discovery/brief.md"], "discovery/requirements.md": [] });
    expect(Object.keys(before.hashes)).toEqual(["discovery/brief.md"]);
    expect(before.hashes["discovery/brief.md"]).toMatch(/^[0-9a-f]{40}$/);
    expect(after.hashes["discovery/brief.md"]).not.toBe(before.hashes["discovery/brief.md"]);
  });

  it("leaves out node_modules and the orchestrator folder", async () => {
    const root = await copyOfSampleProject();
    temps.push(root);
    await mkdir(join(root, "docs/node_modules"), { recursive: true });
    await writeFile(join(root, "docs/node_modules/x.md"), "x");
    await mkdir(join(root, "workflow-orchestrator"), { recursive: true });
    await writeFile(join(root, "workflow-orchestrator/notes.md"), "x");
    const files = new FsProjectFiles(configFor(root, { orchestratorDir: join(root, "workflow-orchestrator") }));

    expect(Object.keys((await files.snapshot(["**/*.md"])).hashes)).not.toContain("workflow-orchestrator/notes.md");
    expect(Object.keys((await files.snapshot(["**/*.md"])).hashes)).not.toContain("docs/node_modules/x.md");
  });
});

describe("FsProjectFiles editing", () => {
  const files = new FsProjectFiles(configFor(sampleProject, { orchestratorDir: join(sampleProject, "workflow-orchestrator") }));

  it.each([
    [".cursor/skills/requirements-elicitation/SKILL.md", true],
    [".agents/skills/discovery/architecture-review/SKILL.md", true],
    [".cursor/agents/architect.md", true],
    ["discovery/brief.md", true],
    ["wiki/new/page.md", true],
    ["src/index.ts", false],
    [".cursor/agents/nested/x.md", false],
    [".cursor/workflows/ba-discovery.json", false],
    ["../outside.md", false],
    ["discovery/../src/index.ts", false],
    ["/etc/passwd", false],
    ["docs/node_modules/x.md", false],
    ["discovery/.git/config", false],
    ["workflow-orchestrator/discovery/x.md", false],
    ["", false],
  ])("isEditable(%j) is %s", (path, expected) => {
    expect(files.isEditable(path)).toBe(expected);
  });

  it("reads text with its size, and null for a missing file", async () => {
    const file = await files.readText("discovery/brief.md");
    expect(file?.content.startsWith("# Brief")).toBe(true);
    expect(file?.size).toBeGreaterThan(0);
    expect(await files.readText("discovery/none.md")).toBeNull();
  });

  it("writes text, creating folders", async () => {
    const root = await copyOfSampleProject();
    temps.push(root);
    await new FsProjectFiles(configFor(root)).writeText("wiki/decisions/0001.md", "# Decision");
    expect(await readFile(join(root, "wiki/decisions/0001.md"), "utf8")).toBe("# Decision");
  });
});

describe("FsProjectFiles on a changed copy", () => {
  it("reports a broken SKILL.md as unreadable", async () => {
    const root = await copyOfSampleProject();
    temps.push(root);
    await mkdir(join(root, ".cursor/skills/broken"), { recursive: true });
    await writeFile(join(root, ".cursor/skills/broken/SKILL.md"), "---\ndescription: [oops\n---\n");

    const docs = await new FsProjectFiles(configFor(root)).skillDocs();

    expect(docs.find((d) => d.path === ".cursor/skills/broken/SKILL.md")).toMatchObject({ error: expect.any(String) });
  });

  it("gives no agents when the agent folder is missing", async () => {
    const root = await copyOfSampleProject();
    temps.push(root);
    await rm(join(root, ".cursor/agents"), { recursive: true });

    expect(await new FsProjectFiles(configFor(root)).agentDocs()).toEqual([]);
  });

  it("never lists node_modules or the orchestrator folder as artefacts", async () => {
    const root = await copyOfSampleProject();
    temps.push(root);
    await mkdir(join(root, "docs/node_modules/pkg"), { recursive: true });
    await writeFile(join(root, "docs/node_modules/pkg/README.md"), "x");
    await mkdir(join(root, "docs/workflow-orchestrator"), { recursive: true });
    await writeFile(join(root, "docs/workflow-orchestrator/notes.md"), "x");
    await writeFile(join(root, "docs/guide.md"), "x");

    const config = configFor(root, { orchestratorDir: join(root, "docs/workflow-orchestrator") });
    const paths = (await new FsProjectFiles(config).artefacts()).map((a) => a.path);

    expect(paths).toEqual(["discovery/brief.md", "docs/guide.md", "wiki/README.md"]);
  });
});
