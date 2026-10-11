import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { glob } from "tinyglobby";
import type { ProjectFiles } from "../application/ProjectFiles";
import type { ResolvedConfig } from "../domain/config";
import type { Snapshot } from "../domain/outputs";
import type { Artefact, MarkdownDoc, UnreadableDoc } from "../domain/registry";
import { parseMarkdown } from "./frontmatter";

const trimSlashes = (dir: string) => dir.replace(/^\.\/|\/+$/g, "");

// ProjectFiles on the real file system, rooted at config.projectRoot. Missing
// skill or agent folders give no docs. node_modules, .git and the orchestrator
// folder itself are never artefacts.
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
    const paths = await this.match(this.config.artefactGlobs);
    const artefacts: Artefact[] = [];
    for (const path of paths.sort()) {
      const info = await stat(join(this.root, path));
      artefacts.push({ path, size: info.size, mtimeMs: info.mtimeMs });
    }
    return artefacts;
  }

  async snapshot(patterns: string[]): Promise<Snapshot> {
    const matches: Record<string, string[]> = {};
    for (const pattern of patterns) matches[pattern] = (await this.match([pattern])).sort();
    const hashes: Record<string, string> = {};
    for (const path of [...new Set(Object.values(matches).flat())].sort()) {
      const content = await readFile(join(this.root, path));
      hashes[path] = createHash("sha1").update(content).digest("hex");
    }
    return { hashes, matches };
  }

  // Files under the root matching the patterns, never node_modules, .git or
  // the orchestrator folder.
  private async match(patterns: string[]): Promise<string[]> {
    const ignore = ["**/node_modules/**", "**/.git/**"];
    const orchestrator = relative(this.root, this.config.orchestratorDir);
    if (orchestrator && !orchestrator.startsWith("..") && !isAbsolute(orchestrator)) {
      ignore.push(`${orchestrator.split("\\").join("/")}/**`);
    }
    return await glob(patterns, { cwd: this.root, onlyFiles: true, dot: false, ignore });
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
