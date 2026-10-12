import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
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
      ".cursor/skills/implement-requirement/SKILL.md",
      ".cursor/skills/requirements-elicitation/SKILL.md",
      ".agents/skills/discovery/architecture-review/SKILL.md",
    ]);
    expect(docs[1]).toMatchObject({ frontmatter: { name: "requirements-elicitation" } });
  });

  it("reads agents directly inside the agent folder", async () => {
    const docs = await files.agentDocs();
    expect(docs.map((d) => d.path)).toEqual([".cursor/agents/architect.md", ".cursor/agents/business-analyst.md", ".cursor/agents/developer.md"]);
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

describe("FsProjectFiles git trees and diffs", () => {
  const git = async (root: string, ...args: string[]) => (await run("git", args, { cwd: root })).stdout;
  const filesIn = async (root: string) => new FsProjectFiles(configFor(root, { dataDir: await tempDir() }));
  // Everything about the repository a person could see change.
  const repoState = async (root: string) => ({
    status: await git(root, "status", "--porcelain"),
    staged: await git(root, "diff", "--cached"),
    stash: await git(root, "stash", "list"),
    head: await git(root, "rev-parse", "HEAD"),
    branches: await git(root, "branch", "--list"),
  });

  it("records a tree without changing status, the index, stash, branches or HEAD", async () => {
    const root = await tempDir();
    await gitRepo(root, { "kb/a.md": "a\n", "kb/b.md": "b\n" });
    await write(root, { "kb/a.md": "a staged\n" });
    await git(root, "add", "kb/a.md");
    await write(root, { "kb/b.md": "b edited\n", "new.md": "n\n" });
    const before = await repoState(root);

    const tree = await (await filesIn(root)).recordTree("run-t/step-1");

    expect(tree).toMatch(/^[0-9a-f]{40}$/);
    expect(await repoState(root)).toEqual(before);
  });

  it("diffs a modified, a created and a deleted file against the tree, counting lines", async () => {
    const root = await tempDir();
    await gitRepo(root, { "kb/a.md": "one\ntwo\nthree\n", "kb/old.md": "gone\nsoon\n" });
    const files = await filesIn(root);
    const tree = await files.recordTree("run-t/step-1");
    await write(root, { "kb/a.md": "one\nTWO\nthree\nfour\n", "kb/new.md": "fresh\n" });
    await rm(join(root, "kb/old.md"));

    const [modified, created, deleted] = await files.diff(tree, ["kb/a.md", "kb/new.md", "kb/old.md"]);

    expect(modified).toEqual({ path: "kb/a.md", added: 2, removed: 1, diff: "@@ -1,3 +1,4 @@\n one\n-two\n+TWO\n three\n+four\n" });
    expect(created).toEqual({ path: "kb/new.md", added: 1, removed: 0, diff: "@@ -0,0 +1 @@\n+fresh\n" });
    expect(deleted).toMatchObject({ path: "kb/old.md", added: 0, removed: 2 });
  });

  it("counts untracked and staged-but-uncommitted changes as before the step", async () => {
    const root = await tempDir();
    await gitRepo(root, { "kb/a.md": "a\n" });
    await write(root, { "kb/a.md": "a staged\n", "kb/draft.md": "draft\n" });
    await git(root, "add", "kb/a.md");
    const files = await filesIn(root);
    const tree = await files.recordTree("run-t/step-1");
    await write(root, { "kb/draft.md": "draft\nmore\n" });

    const [staged, draft] = await files.diff(tree, ["kb/a.md", "kb/draft.md"]);

    expect(staged).toEqual({ path: "kb/a.md", added: 0, removed: 0, diff: "" });
    expect(draft).toMatchObject({ added: 1, removed: 0, diff: "@@ -1 +1,2 @@\n draft\n+more\n" });
  });

  it("leaves gitignored files, node_modules and the orchestrator folder out of the tree", async () => {
    const root = await tempDir();
    await gitRepo(root, { ".gitignore": "build/\n", "kb/a.md": "a\n" });
    await write(root, { "build/out.md": "b\n", "docs/node_modules/x.md": "x\n", "orch/notes.md": "o\n" });
    const files = new FsProjectFiles(configFor(root, { dataDir: await tempDir(), orchestratorDir: join(root, "orch") }));

    const tree = await files.recordTree("run-t/step-1");
    const listed = (await git(root, "ls-tree", "-r", "--name-only", tree ?? "")).trim().split("\n");

    expect(listed).toEqual([".gitignore", "kb/a.md"]);
  });

  it("gives no diff for a binary file, a diff over 200 kB, or a file that may hold credentials", async () => {
    const root = await tempDir();
    await gitRepo(root, { "img.png": "\0PNG\0", "big.md": "x\n", ".env": "K=1\n" });
    const files = await filesIn(root);
    const tree = await files.recordTree("run-t/step-1");
    await write(root, { "img.png": "\0PNG\0changed", "big.md": "y\n".repeat(120_000), ".env": "K=2\n" });

    const diffs = await files.diff(tree, ["img.png", "big.md", ".env"]);

    expect(diffs).toEqual([
      { path: "img.png", added: 0, removed: 0, diff: null, reason: "binary" },
      { path: "big.md", added: 120_000, removed: 1, diff: null, reason: "too large" },
      { path: ".env", added: 0, removed: 0, diff: null, reason: "secret" },
    ]);
  });

  it("diffs a project in a subfolder of its repository with paths relative to the project", async () => {
    const outer = await tempDir();
    await gitRepo(outer, { "README.md": "r\n", "host/kb/a.md": "a\n" });
    const root = join(outer, "host");
    const files = await filesIn(root);
    const tree = await files.recordTree("run-t/step-1");
    await write(root, { "kb/a.md": "b\n" });

    expect(await files.diff(tree, ["kb/a.md"])).toEqual([{ path: "kb/a.md", added: 1, removed: 1, diff: "@@ -1 +1 @@\n-a\n+b\n" }]);
  });

  it("records no tree outside git, and every diff says so", async () => {
    const root = await tempDir();
    await write(root, { "kb/a.md": "a\n" });
    const files = await filesIn(root);

    expect(await files.recordTree("run-t/step-1")).toBeNull();
    expect(await files.diff(null, ["kb/a.md"])).toEqual([{ path: "kb/a.md", added: 0, removed: 0, diff: null, reason: "no git" }]);
  });

  it("records no tree for a project its repository ignores", async () => {
    const outer = await tempDir();
    await gitRepo(outer, { ".gitignore": "data/\n", "README.md": "r" });
    const root = join(outer, "data/host");
    await write(root, { "kb/a.md": "a" });

    expect(await (await filesIn(root)).recordTree("run-t/step-1")).toBeNull();
  });
});

describe("FsProjectFiles gate diff safety", () => {
  const git = async (root: string, ...args: string[]) => (await run("git", args, { cwd: root })).stdout;
  const filesIn = async (root: string) => new FsProjectFiles(configFor(root, { dataDir: await tempDir() }));

  it("keeps the tree under a ref, so git gc doesn't remove it, and forgets it with the run", async () => {
    const root = await tempDir();
    await gitRepo(root, { "kb/a.md": "a\n" });
    const files = await filesIn(root);
    await write(root, { "kb/a.md": "a\nuncommitted\n" });
    const tree = await files.recordTree("run-1/elicit-1");
    await git(root, "gc", "--prune=now", "-q");

    expect((await git(root, "for-each-ref", "--format=%(objectname)", "refs/orchestrator/run-1/")).trim()).toBe(tree);
    expect((await files.diff(tree, ["kb/a.md"]))[0]).toMatchObject({ diff: "" });

    await files.forgetTrees("run-1");
    expect(await git(root, "for-each-ref", "refs/orchestrator/")).toBe("");
  });

  it("says 'no base' for a tree git doesn't have or an id that isn't one", async () => {
    const root = await tempDir();
    await gitRepo(root, { "kb/a.md": "a\n" });
    const files = await filesIn(root);

    expect(await files.diff("0".repeat(40), ["kb/a.md"])).toEqual([{ path: "kb/a.md", added: 0, removed: 0, diff: null, reason: "no base" }]);
    expect(await files.diff("--output=/tmp/x", ["kb/a.md"])).toEqual([{ path: "kb/a.md", added: 0, removed: 0, diff: null, reason: "no base" }]);
  });

  it("reads paths literally: a[b].md is not a pattern for ab.md", async () => {
    const root = await tempDir();
    await gitRepo(root, { "a[b].md": "one\n", "ab.md": "x\n" });
    const files = await filesIn(root);
    const tree = await files.recordTree("run-1/s-1");
    await write(root, { "a[b].md": "two\n", "ab.md": "y\n" });

    expect(await files.diff(tree, ["a[b].md"])).toEqual([{ path: "a[b].md", added: 1, removed: 1, diff: "@@ -1 +1 @@\n-one\n+two\n" }]);
  });

  it("doesn't diff a gitignored file, a credential file in any case, or a link to one", async () => {
    const root = await tempDir();
    await gitRepo(root, { ".gitignore": "secret.json\n", "kb/a.md": "a\n" });
    await write(root, { "secret.json": "{}", ".ENV": "K=1\n" });
    await symlink(join(root, ".ENV"), join(root, "kb/notes.md"));
    const files = await filesIn(root);
    const tree = await files.recordTree("run-1/s-1");

    const diffs = await files.diff(tree, ["secret.json", ".ENV", "kb/notes.md"]);

    expect(diffs.map((d) => d.reason)).toEqual(["secret", "secret", "secret"]);
    expect(await files.canOpen("kb/notes.md")).toBe(false);
  });

  it("still diffs a deleted file, which only the base tree has", async () => {
    const root = await tempDir();
    await gitRepo(root, { "kb/old.md": "gone\n" });
    const files = await filesIn(root);
    const tree = await files.recordTree("run-1/s-1");
    await rm(join(root, "kb/old.md"));

    expect(await files.diff(tree, ["kb/old.md"])).toEqual([{ path: "kb/old.md", added: 0, removed: 1, diff: "@@ -1 +0,0 @@\n-gone\n" }]);
  });

  it("refuses a tree name that isn't <run>/<step>", async () => {
    const files = await filesIn(await tempDir());
    await expect(files.recordTree("../x")).rejects.toThrow("invalid tree name");
  });
});

describe("FsProjectFiles snapshots of awkward files", () => {
  it("leaves out a symlink loop and an unreadable file instead of failing", async () => {
    const root = await tempDir();
    await write(root, { "kb/a.md": "a", "kb/locked.md": "x" });
    await symlink(join(root, "loop-b"), join(root, "loop-a"));
    await symlink(join(root, "loop-a"), join(root, "loop-b"));
    await chmod(join(root, "kb/locked.md"), 0o000);

    const paths = Object.keys((await new FsProjectFiles(configFor(root)).snapshot([])).hashes);

    await chmod(join(root, "kb/locked.md"), 0o644);
    expect(paths).toContain("kb/a.md");
    expect(paths).not.toContain("loop-a");
    expect(paths).not.toContain("kb/locked.md");
  });
});
