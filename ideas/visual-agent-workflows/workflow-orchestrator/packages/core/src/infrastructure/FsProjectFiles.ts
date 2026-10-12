import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, posix, relative, sep } from "node:path";
import { promisify } from "node:util";
import picomatch from "picomatch";
import { glob } from "tinyglobby";
import type { ProjectFiles } from "../application/ProjectFiles";
import type { ResolvedConfig } from "../domain/config";
import type { FileDiff } from "../domain/gateFiles";
import type { Snapshot } from "../domain/outputs";
import type { Artefact, MarkdownDoc, UnreadableDoc } from "../domain/registry";
import { parseMarkdown } from "./frontmatter";

const run = promisify(execFile);
const trimSlashes = (dir: string) => dir.replace(/^\.\/|\/+$/g, "");

const TEXT_FILES = ["**/*.md", "**/*.mdx", "**/*.txt"];

// Files that commonly hold credentials. Never opened through the orchestrator,
// even when they are in the project's file list.
const SECRET_FILES = [
  "**/.env",
  "**/.env.*",
  "**/.envrc",
  "**/.npmrc",
  "**/.pypirc",
  "**/.netrc",
  "**/*.pem",
  "**/*.key",
  "**/*.p12",
  "**/*.pfx",
  "**/id_rsa*",
  "**/id_dsa*",
  "**/id_ecdsa*",
  "**/id_ed25519*",
  "**/.ssh/**",
  "**/.aws/**",
  "**/.gnupg/**",
];
const isSecret = picomatch(SECRET_FILES, { dot: true });
const HASH_LIMIT_BYTES = 5 * 1024 * 1024;
const DIFF_LIMIT_BYTES = 200 * 1024;

async function git(cwd: string, args: string[], env: Record<string, string> = {}): Promise<string> {
  const { stdout } = await run("git", args, { cwd, maxBuffer: 256 * 1024 * 1024, env: { ...process.env, ...env } });
  return stdout;
}

// Lines added and removed in a diff's hunks.
function countLines(hunks: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of hunks.split("\n")) {
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }
  return { added, removed };
}

const sha1 = (bytes: Buffer) => createHash("sha1").update(bytes).digest("hex");

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

// ProjectFiles on the real file system, rooted at config.projectRoot. Missing
// skill or agent folders give no docs. node_modules, .git, the orchestrator
// folder and (in a git repository) gitignored files are never project files.
export class FsProjectFiles implements ProjectFiles {
  readonly root: string;

  constructor(private readonly config: ResolvedConfig) {
    this.root = config.projectRoot;
  }

  async skillDocs(): Promise<(MarkdownDoc | UnreadableDoc)[]> {
    const docs: (MarkdownDoc | UnreadableDoc)[] = [];
    for (const dir of this.config.skillDirs.map(trimSlashes)) {
      const found = await glob("**/SKILL.md", { cwd: join(this.root, dir), onlyFiles: true });
      for (const path of found.sort()) docs.push(await this.readDoc(`${dir}/${path}`));
    }
    return docs;
  }

  async agentDocs(): Promise<(MarkdownDoc | UnreadableDoc)[]> {
    const docs: (MarkdownDoc | UnreadableDoc)[] = [];
    for (const dir of this.config.agentDirs.map(trimSlashes)) {
      const names = await this.markdownFilesIn(dir);
      for (const name of names) docs.push(await this.readDoc(`${dir}/${name}`));
    }
    return docs;
  }

  async artefacts(): Promise<Artefact[]> {
    const own = [this.config.workflowsDir, ...this.config.skillDirs, ...this.config.agentDirs].map((dir) => `${trimSlashes(dir)}/**`);
    const isOwn = picomatch(own, { dot: true });
    const isText = picomatch(TEXT_FILES, { dot: true });
    const inGlobs = this.config.artefactGlobs ? picomatch(this.config.artefactGlobs, { dot: true }) : () => true;
    const artefacts: Artefact[] = [];
    for (const path of await this.projectFiles()) {
      if (isOwn(path) || !isText(path) || !inGlobs(path)) continue;
      const info = await stat(join(this.root, path));
      artefacts.push({ path, size: info.size, mtimeMs: info.mtimeMs });
    }
    return artefacts;
  }

  async snapshot(declared: string[]): Promise<Snapshot> {
    const paths = await this.projectFiles();
    const hashes: Record<string, string> = {};
    for (const path of paths) hashes[path] = await this.hash(path);
    const matches: Record<string, string[]> = {};
    for (const pattern of declared) {
      const isMatch = picomatch(pattern, { dot: true });
      matches[pattern] = paths.filter((path) => isMatch(path));
    }
    return { hashes, matches };
  }

  async recordTree(): Promise<string | null> {
    if (!(await this.inGitWorkTree())) return null;
    const orchestrator = this.orchestratorPath();
    const exclude = [":(exclude,glob)**/node_modules/**", ...(orchestrator ? [`:(exclude)${orchestrator}`] : [])];
    return await this.withTempIndex(async (env) => {
      const index = (await git(this.root, ["rev-parse", "--path-format=absolute", "--git-path", "index"])).trim();
      if (await isFile(index)) await copyFile(index, env.GIT_INDEX_FILE);
      await git(this.root, ["add", "-A", "--", ".", ...exclude], env);
      return (await git(this.root, ["write-tree"], env)).trim();
    });
  }

  async diff(baseTree: string | null, paths: string[]): Promise<FileDiff[]> {
    const none = (path: string, reason: NonNullable<FileDiff["reason"]>): FileDiff => ({ path, added: 0, removed: 0, diff: null, reason });
    if (baseTree === null || !(await this.inGitWorkTree())) return paths.map((path) => none(path, "no git"));
    const safe = paths.filter((path) => this.isProjectPath(path) && !isSecret(path));
    return await this.withTempIndex(async (env) => {
      await git(this.root, ["read-tree", baseTree], env);
      if (safe.length > 0) await git(this.root, ["update-index", "--add", "--remove", "--", ...safe], env);
      const diffs: FileDiff[] = [];
      for (const path of paths) {
        if (!safe.includes(path)) {
          diffs.push(none(path, "secret"));
          continue;
        }
        const args = ["diff", "--cached", "--relative", "--no-color", "--no-ext-diff", "--no-renames", "-U3", baseTree, "--", path];
        const output = await git(this.root, args, env);
        const start = output.search(/^@@/m);
        if (start === -1) {
          diffs.push(/^Binary files /m.test(output) ? none(path, "binary") : { path, added: 0, removed: 0, diff: "" });
          continue;
        }
        const hunks = output.slice(start);
        const counts = countLines(hunks);
        diffs.push(Buffer.byteLength(hunks) > DIFF_LIMIT_BYTES ? { path, ...counts, diff: null, reason: "too large" } : { path, ...counts, diff: hunks });
      }
      return diffs;
    });
  }

  async canOpen(path: string): Promise<boolean> {
    if (!this.isProjectPath(path) || isSecret(path)) return false;
    if (!(await this.projectFiles()).includes(path)) return false;
    return await this.staysInside(path);
  }

  async readText(path: string): Promise<{ content: string; size: number; version: string } | null> {
    try {
      const info = await stat(join(this.root, path));
      if (!info.isFile()) return null;
      if (info.size > 1024 * 1024) return { content: "", size: info.size, version: `${info.size}:${info.mtimeMs}` };
      const bytes = await readFile(join(this.root, path));
      return { content: bytes.toString("utf8"), size: info.size, version: sha1(bytes) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async writeText(path: string, content: string): Promise<{ version: string }> {
    const bytes = Buffer.from(content, "utf8");
    await mkdir(dirname(join(this.root, path)), { recursive: true });
    await writeFile(join(this.root, path), bytes);
    return { version: sha1(bytes) };
  }

  // Whether a path is relative, normalised and stays inside the root on paper
  // (no "..", no backslashes). Says nothing about whether the file exists.
  private isProjectPath(path: string): boolean {
    if (!path || isAbsolute(path) || path.includes("\\")) return false;
    const normal = posix.normalize(path);
    return normal === path && !normal.startsWith("../") && normal !== "..";
  }

  // Runs `work` with GIT_INDEX_FILE pointing at a new, empty temporary index
  // file under the data folder, and removes the file afterwards.
  private async withTempIndex<T>(work: (env: { GIT_INDEX_FILE: string }) => Promise<T>): Promise<T> {
    const dir = join(this.config.dataDir, "tmp");
    await mkdir(dir, { recursive: true });
    const file = join(dir, `index-${randomUUID()}`);
    try {
      return await work({ GIT_INDEX_FILE: file });
    } finally {
      await rm(file, { force: true });
      await rm(`${file}.lock`, { force: true });
    }
  }

  // Whether the file's real location (after following any symlinks on the
  // way) is inside the project root.
  private async staysInside(path: string): Promise<boolean> {
    const [root, target] = await Promise.all([realpath(this.root), realpath(join(this.root, path))]);
    return target.startsWith(`${root}${sep}`);
  }

  // The orchestrator folder relative to the root, when it is inside it.
  private orchestratorPath(): string | null {
    const inside = relative(this.root, this.config.orchestratorDir).split("\\").join("/");
    return inside && !inside.startsWith("..") && !isAbsolute(inside) ? inside : null;
  }

  // Every file in the project, sorted: from git (tracked and untracked, minus
  // what .gitignore excludes) when the root is inside a git work tree that
  // doesn't ignore it, otherwise from walking the folders. Git can list
  // deleted or submodule entries, so those are checked to be files. Never .git,
  // node_modules or the orchestrator folder.
  private async projectFiles(): Promise<string[]> {
    const orchestrator = this.orchestratorPath();
    const ignore = ["**/node_modules/**", "**/.git/**", ...(orchestrator ? [`${orchestrator}/**`] : [])];
    const fromGit = await this.gitFiles();
    const listed = fromGit ?? (await glob("**", { cwd: this.root, onlyFiles: true, dot: true, ignore, followSymbolicLinks: false }));
    const files: string[] = [];
    for (const path of new Set(listed)) {
      const segments = path.split("/");
      if (segments.includes(".git") || segments.includes("node_modules")) continue;
      if (orchestrator && (path === orchestrator || path.startsWith(`${orchestrator}/`))) continue;
      files.push(path);
    }
    if (fromGit === null) return files.sort();
    const existing: string[] = [];
    for (const path of files) if (await isFile(join(this.root, path))) existing.push(path);
    return existing.sort();
  }

  // The git file list relative to the root, or null when git can't give one:
  // not a git work tree, the root is ignored by its repository, or no git.
  private async gitFiles(): Promise<string[] | null> {
    if (!(await this.inGitWorkTree())) return null;
    const output = await git(this.root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
    return output.split("\0").filter((path) => path !== "");
  }

  // Whether the root is inside a git work tree that doesn't ignore it.
  private async inGitWorkTree(): Promise<boolean> {
    try {
      await git(this.root, ["check-ignore", "-q", "--", this.root]);
      return false; // exit 0: the root itself is ignored
    } catch (error) {
      return (error as { code?: unknown }).code === 1; // 128: not a repository; ENOENT: no git
    }
  }

  // A content hash, or size and modification time for files over 5 MB.
  private async hash(path: string): Promise<string> {
    const info = await stat(join(this.root, path));
    if (info.size > HASH_LIMIT_BYTES) return `${info.size}:${info.mtimeMs}`;
    return sha1(await readFile(join(this.root, path)));
  }

  private async markdownFilesIn(dir: string): Promise<string[]> {
    try {
      const entries = await readdir(join(this.root, dir), { withFileTypes: true });
      return entries.filter((e) => e.isFile() && e.name.endsWith(".md")).map((e) => e.name).sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private async readDoc(path: string): Promise<MarkdownDoc | UnreadableDoc> {
    try {
      return parseMarkdown(path, await readFile(join(this.root, path), "utf8"));
    } catch (error) {
      return { path, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
