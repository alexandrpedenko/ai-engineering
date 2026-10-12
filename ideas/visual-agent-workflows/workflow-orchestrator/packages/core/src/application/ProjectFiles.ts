import type { FileDiff } from "../domain/gateFiles";
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
  // Stores the project's files as they are now (the same files as snapshot)
  // as a git tree and returns its id, without touching the person's index,
  // stash, branches or HEAD. null when the project isn't in a git work tree.
  recordTree(): Promise<string | null>;
  // Each path's diff from `baseTree` (a recordTree id) to the file on disk
  // now, in the order given. With no base tree, every path has no diff
  // (reason "no git").
  diff(baseTree: string | null, paths: string[]): Promise<FileDiff[]>;
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
