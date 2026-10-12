import type { ProjectFiles } from "../../src/application/ProjectFiles";
import type { FileDiff } from "../../src/domain/gateFiles";
import type { Snapshot } from "../../src/domain/outputs";
import type { Artefact, MarkdownDoc, UnreadableDoc } from "../../src/domain/registry";

// A version that changes with the content: "v:" and the content itself.
export const fakeVersion = (content: string) => `v:${content}`;

// ProjectFiles that returns whatever a test puts in it. `snapshots` are
// returned in order by snapshot() (the last one repeats; empty by default),
// and `trees` in order by recordTree() (null once they run out). diff() gives
// each path's entry from `diffs`, or an empty diff; `diffCalls` records the
// base tree and paths it was asked for.
export class FakeProjectFiles implements ProjectFiles {
  readonly root = "/host";
  skills: (MarkdownDoc | UnreadableDoc)[] = [];
  agents: (MarkdownDoc | UnreadableDoc)[] = [];
  files: Artefact[] = [];
  snapshots: Snapshot[] = [];
  snapshotCalls: string[][] = [];

  async skillDocs() {
    return this.skills;
  }

  async agentDocs() {
    return this.agents;
  }

  async artefacts() {
    return this.files;
  }

  editable = new Set<string>();
  texts = new Map<string, string>();

  async canOpen(path: string) {
    return this.editable.has(path);
  }

  // Like the real one: a file over 1 MB comes back without its content.
  async readText(path: string) {
    const content = this.texts.get(path);
    if (content === undefined) return null;
    const size = new TextEncoder().encode(content).length;
    return size > 1024 * 1024 ? { content: "", size, version: `${size}:0` } : { content, size, version: fakeVersion(content) };
  }

  async writeText(path: string, content: string) {
    this.texts.set(path, content);
    return { version: fakeVersion(content) };
  }

  trees: (string | null)[] = [];
  treeNames: string[] = [];
  forgotten: string[] = [];
  diffs = new Map<string, FileDiff>();
  diffCalls: { baseTree: string | null; paths: string[] }[] = [];

  async recordTree(name: string) {
    this.treeNames.push(name);
    return this.trees.shift() ?? null;
  }

  // Like the real one: no base tree means no diff, reason "no git".
  async diff(baseTree: string | null, paths: string[]) {
    this.diffCalls.push({ baseTree, paths });
    if (baseTree === null) return paths.map((path) => ({ path, added: 0, removed: 0, diff: null, reason: "no git" as const }));
    return paths.map((path) => this.diffs.get(path) ?? { path, added: 0, removed: 0, diff: "" });
  }

  async forgetTrees(prefix: string) {
    this.forgotten.push(prefix);
  }

  async snapshot(declared: string[]): Promise<Snapshot> {
    const index = Math.min(this.snapshotCalls.length, this.snapshots.length - 1);
    this.snapshotCalls.push(declared);
    return this.snapshots[index] ?? { hashes: {}, matches: {} };
  }
}
