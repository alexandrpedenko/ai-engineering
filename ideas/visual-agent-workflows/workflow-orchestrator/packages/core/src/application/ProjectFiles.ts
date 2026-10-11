import type { Snapshot } from "../domain/outputs";
import type { Artefact, MarkdownDoc, UnreadableDoc } from "../domain/registry";

// Access to the host project's files: skills, agents, artefacts, and the
// whole project's file list for snapshots.
export interface ProjectFiles {
  readonly root: string;
  // Every SKILL.md under each skill folder, in config order, then path order.
  skillDocs(): Promise<(MarkdownDoc | UnreadableDoc)[]>;
  // Every *.md directly inside each agent folder, in config order, then path order.
  agentDocs(): Promise<(MarkdownDoc | UnreadableDoc)[]>;
  // Every markdown or text file outside the skill, agent and workflow folders
  // (only those matching the artefact globs, when the config sets them).
  artefacts(): Promise<Artefact[]>;
  // A hash of every file in the project, and which of those paths each
  // declared pattern matched.
  snapshot(declared: string[]): Promise<Snapshot>;
  // Whether a person may read and edit this file through the orchestrator:
  // an existing project file whose real location is inside the project, and
  // not a file that commonly holds credentials (.env, keys, .npmrc, …).
  canOpen(path: string): Promise<boolean>;
  // null when the file doesn't exist. `version` names the content (it changes
  // whenever the content does); content is "" for a file over 1 MB.
  readText(path: string): Promise<{ content: string; size: number; version: string } | null>;
  // Returns the written content's version.
  writeText(path: string, content: string): Promise<{ version: string }>;
}
