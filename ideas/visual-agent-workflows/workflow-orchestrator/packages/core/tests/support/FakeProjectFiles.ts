import type { ProjectFiles } from "../../src/application/ProjectFiles";
import type { Artefact, MarkdownDoc, UnreadableDoc } from "../../src/domain/registry";

// ProjectFiles that returns whatever a test puts in it.
export class FakeProjectFiles implements ProjectFiles {
  readonly root = "/host";
  skills: (MarkdownDoc | UnreadableDoc)[] = [];
  agents: (MarkdownDoc | UnreadableDoc)[] = [];
  files: Artefact[] = [];

  async skillDocs() {
    return this.skills;
  }

  async agentDocs() {
    return this.agents;
  }

  async artefacts() {
    return this.files;
  }
}
