import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { OrchestratorConfig, type ResolvedConfig } from "../../src/domain/config";
import { FsProjectFiles } from "../../src/infrastructure/FsProjectFiles";
import { copyOfSampleProject, orchestratorDir, sampleProject } from "../support/paths";

function configFor(projectRoot: string, overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return { ...OrchestratorConfig.parse({}), orchestratorDir, projectRoot, dataDir: join(orchestratorDir, ".data"), ...overrides };
}

const run = promisify(execFile);

const temps: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "orch-files-"));
  temps.push(dir);
  return dir;
}

async function write(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
}

// A git repository at `root` with `files` committed.
async function gitRepo(root: string, files: Record<string, string>): Promise<void> {
  await write(root, files);
  await run("git", ["init", "-q"], { cwd: root });
  await run("git", ["add", "-A"], { cwd: root });
  await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "init"], { cwd: root });
}
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

  it("lists markdown and text files outside the skill, agent and workflow folders as artefacts", async () => {
    const artefacts = await files.artefacts();
    expect(artefacts.map((a) => a.path)).toEqual(["discovery/brief.md", "wiki/README.md"]);
    expect(artefacts[0]?.size).toBeGreaterThan(0);
  });
});

describe("FsProjectFiles artefacts in any folder", () => {
  it("finds artefacts wherever they are, with no globs", async () => {
    const root = await tempDir();
    await write(root, { "kb/a.md": "a", "ux-space/flows/b.mdx": "b", "notes.txt": "n", "src/index.ts": "x", ".cursor/skills/s/SKILL.md": "s" });

    const paths = (await new FsProjectFiles(configFor(root)).artefacts()).map((a) => a.path);

    expect(paths).toEqual(["kb/a.md", "notes.txt", "ux-space/flows/b.mdx"]);
  });

  it("lists only the files matching artefactGlobs when they are set", async () => {
    const root = await tempDir();
    await write(root, { "kb/a.md": "a", "ux-space/b.md": "b" });

    const paths = (await new FsProjectFiles(configFor(root, { artefactGlobs: ["kb/**"] })).artefacts()).map((a) => a.path);

    expect(paths).toEqual(["kb/a.md"]);
  });
});

describe("FsProjectFiles.snapshot", () => {
  it("hashes every project file and records what each declared pattern matched", async () => {
    const root = await copyOfSampleProject();
    temps.push(root);
    const files = new FsProjectFiles(configFor(root));

    const before = await files.snapshot(["discovery/**", "discovery/requirements.md"]);
    await writeFile(join(root, "discovery/brief.md"), "changed");
    const after = await files.snapshot([]);

    expect(before.matches).toEqual({ "discovery/**": ["discovery/brief.md"], "discovery/requirements.md": [] });
    expect(Object.keys(before.hashes)).toContain("src/index.ts");
    expect(Object.keys(before.hashes)).toContain(".cursor/agents/architect.md");
    expect(before.hashes["discovery/brief.md"]).toMatch(/^[0-9a-f]{40}$/);
    expect(after.hashes["discovery/brief.md"]).not.toBe(before.hashes["discovery/brief.md"]);
    expect(after.matches).toEqual({});
  });

  it("leaves out node_modules and the orchestrator folder", async () => {
    const root = await copyOfSampleProject();
    temps.push(root);
    await write(root, { "docs/node_modules/x.md": "x", "workflow-orchestrator/notes.md": "x" });
    const files = new FsProjectFiles(configFor(root, { orchestratorDir: join(root, "workflow-orchestrator") }));

    const paths = Object.keys((await files.snapshot([])).hashes);

    expect(paths).not.toContain("workflow-orchestrator/notes.md");
    expect(paths).not.toContain("docs/node_modules/x.md");
  });

  it("keys a file over 5 MB by its size and modification time", async () => {
    const root = await tempDir();
    await write(root, { "big.bin": "x".repeat(5 * 1024 * 1024 + 1) });
    await utimes(join(root, "big.bin"), 1_000, 1_000);

    const { hashes } = await new FsProjectFiles(configFor(root)).snapshot([]);

    expect(hashes["big.bin"]).toBe(`${5 * 1024 * 1024 + 1}:1000000`);
  });
});

describe("FsProjectFiles in a git repository", () => {
  it("lists tracked and untracked files, but not gitignored or deleted ones", async () => {
    const root = await tempDir();
    await gitRepo(root, { ".gitignore": "build/\n", "kb/a.md": "a", "old.md": "o" });
    await write(root, { "build/out.md": "b", "ux-space/flows.md": "f" });
    await rm(join(root, "old.md"));

    const paths = Object.keys((await new FsProjectFiles(configFor(root)).snapshot([])).hashes);

    expect(paths).toEqual([".gitignore", "kb/a.md", "ux-space/flows.md"]);
  });

  it("walks the folders when the project is ignored by the repository around it", async () => {
    const outer = await tempDir();
    await gitRepo(outer, { ".gitignore": "data/\n", "README.md": "r" });
    const root = join(outer, "data/host");
    await write(root, { "kb/a.md": "a" });

    const paths = Object.keys((await new FsProjectFiles(configFor(root)).snapshot([])).hashes);

    expect(paths).toEqual(["kb/a.md"]);
  });
});

describe("FsProjectFiles opening files", () => {
  const files = new FsProjectFiles(configFor(sampleProject, { orchestratorDir: join(sampleProject, "workflow-orchestrator") }));

  it.each([
    [".cursor/skills/requirements-elicitation/SKILL.md", true],
    [".agents/skills/discovery/architecture-review/SKILL.md", true],
    [".cursor/agents/architect.md", true],
    ["discovery/brief.md", true],
    ["src/index.ts", true],
    ["wiki/new/page.md", false],
    ["../outside.md", false],
    ["discovery/../src/index.ts", false],
    ["/etc/passwd", false],
    ["", false],
  ])("canOpen(%j) is %s", async (path, expected) => {
    expect(await files.canOpen(path)).toBe(expected);
  });

  it("refuses files that commonly hold credentials", async () => {
    const root = await tempDir();
    const secrets = [".env", "app/.env.local", ".envrc", ".npmrc", "certs/server.pem", "certs/server.key", "keys/id_ed25519", "home/.ssh/config", "home/.aws/credentials"];
    await write(root, Object.fromEntries([...secrets, "kb/a.md"].map((path) => [path, "x"])));
    const files = new FsProjectFiles(configFor(root));

    for (const path of secrets) expect(await files.canOpen(path), path).toBe(false);
    expect(await files.canOpen("kb/a.md")).toBe(true);
  });

  it("refuses a symlink that leads outside the project, and the walk doesn't follow linked folders", async () => {
    const outside = await tempDir();
    await write(outside, { "secret.md": "s", "dir/inner.md": "i" });
    const root = await tempDir();
    await write(root, { "kb/a.md": "a" });
    await symlink(join(outside, "secret.md"), join(root, "kb/link.md"));
    await symlink(join(outside, "dir"), join(root, "linked"));
    const files = new FsProjectFiles(configFor(root));

    expect(await files.canOpen("kb/link.md")).toBe(false);
    expect(Object.keys((await files.snapshot([])).hashes)).not.toContain("linked/inner.md");
  });

  it("refuses .env files, node_modules and the orchestrator folder", async () => {
    const root = await tempDir();
    await write(root, { ".env": "K=1", "config/.env.local": "K=1", "docs/node_modules/x.md": "x", "orch/notes.md": "x", "kb/a.md": "a" });
    const inRoot = new FsProjectFiles(configFor(root, { orchestratorDir: join(root, "orch") }));

    expect(await inRoot.canOpen(".env")).toBe(false);
    expect(await inRoot.canOpen("config/.env.local")).toBe(false);
    expect(await inRoot.canOpen("docs/node_modules/x.md")).toBe(false);
    expect(await inRoot.canOpen("orch/notes.md")).toBe(false);
    expect(await inRoot.canOpen("kb/a.md")).toBe(true);
  });

  it("refuses a symlink in a git repository that leads outside the project", async () => {
    const outside = await tempDir();
    await write(outside, { "secret.md": "s" });
    const root = await tempDir();
    await gitRepo(root, { "kb/a.md": "a" });
    await symlink(join(outside, "secret.md"), join(root, "kb/link.md"));
    await symlink(join(root, "kb/a.md"), join(root, "kb/alias.md"));
    const files = new FsProjectFiles(configFor(root));

    expect(await files.canOpen("kb/link.md")).toBe(false);
    expect(await files.canOpen("kb/alias.md")).toBe(true);
  });

  it("refuses a gitignored file", async () => {
    const root = await tempDir();
    await gitRepo(root, { ".gitignore": "secrets.json\n", "kb/a.md": "a" });
    await write(root, { "secrets.json": "{}" });

    expect(await new FsProjectFiles(configFor(root)).canOpen("secrets.json")).toBe(false);
  });

  it("reads text with its size and version, and null for a missing file", async () => {
    const file = await files.readText("discovery/brief.md");
    expect(file?.content.startsWith("# Brief")).toBe(true);
    expect(file?.size).toBeGreaterThan(0);
    expect(file?.version).toMatch(/^[0-9a-f]{40}$/);
    expect(await files.readText("discovery/none.md")).toBeNull();
  });

  it("writes text, creating folders", async () => {
    const root = await copyOfSampleProject();
    temps.push(root);
    const files = new FsProjectFiles(configFor(root));
    const { version } = await files.writeText("wiki/decisions/0001.md", "# Decision");
    expect(await readFile(join(root, "wiki/decisions/0001.md"), "utf8")).toBe("# Decision");
    expect((await files.readText("wiki/decisions/0001.md"))?.version).toBe(version);
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
