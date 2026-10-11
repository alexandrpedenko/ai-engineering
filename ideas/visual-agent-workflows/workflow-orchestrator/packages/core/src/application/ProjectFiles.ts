import type { Artefact, MarkdownDoc, UnreadableDoc } from "../domain/registry";

// Read access to the host project's skills, agents and artefacts.
export interface ProjectFiles {
  readonly root: string;
  // Every SKILL.md under each skill folder, in config order, then path order.
  skillDocs(): Promise<(MarkdownDoc | UnreadableDoc)[]>;
  // Every *.md directly inside each agent folder, in config order, then path order.
  agentDocs(): Promise<(MarkdownDoc | UnreadableDoc)[]>;
  // Every file matching the artefact globs.
  artefacts(): Promise<Artefact[]>;
}
