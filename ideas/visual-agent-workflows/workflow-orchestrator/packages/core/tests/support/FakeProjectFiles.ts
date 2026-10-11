import type { ProjectFiles } from "../../src/application/ProjectFiles";
import type { Snapshot } from "../../src/domain/outputs";
import type { Artefact, MarkdownDoc, UnreadableDoc } from "../../src/domain/registry";

// ProjectFiles that returns whatever a test puts in it. `snapshots` are
// returned in order by snapshot() (the last one repeats; empty by default).
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

  async snapshot(patterns: string[]): Promise<Snapshot> {
    const index = Math.min(this.snapshotCalls.length, this.snapshots.length - 1);
    this.snapshotCalls.push(patterns);
    return this.snapshots[index] ?? { hashes: {}, matches: {} };
  }
}
