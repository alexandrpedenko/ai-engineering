import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, posix, relative, sep } from "node:path";
import { promisify } from "node:util";
import picomatch from "picomatch";
import { glob } from "tinyglobby";
import type { ProjectFiles } from "../application/ProjectFiles";
import type { ResolvedConfig } from "../domain/config";
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

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd, maxBuffer: 256 * 1024 * 1024 });
  return stdout;
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

  async canOpen(path: string): Promise<boolean> {
    if (!path || isAbsolute(path) || path.includes("\\")) return false;
    const normal = posix.normalize(path);
    if (normal !== path || normal.startsWith("../") || normal === "..") return false;
    if (isSecret(normal)) return false;
    if (!(await this.projectFiles()).includes(normal)) return false;
    return await this.staysInside(normal);
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
    try {
      await git(this.root, ["check-ignore", "-q", "--", this.root]);
      return null; // exit 0: the root itself is ignored
    } catch (error) {
      if ((error as { code?: unknown }).code !== 1) return null; // 128: not a repository; ENOENT: no git
    }
    const output = await git(this.root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
    return output.split("\0").filter((path) => path !== "");
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
