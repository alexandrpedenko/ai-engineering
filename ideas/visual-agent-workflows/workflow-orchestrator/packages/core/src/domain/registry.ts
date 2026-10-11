// What the orchestrator knows about a host project. All paths are relative to
// the host root and use "/" separators.

export type Skill = { name: string; path: string; description: string; body: string };

export type AgentDef = { name: string; path: string; description: string; model?: string; body: string };

export type Artefact = { path: string; size: number; mtimeMs: number };

export type RegistryWarning = { path: string; message: string };

export type Registry = {
  root: string; // absolute host root
  skills: Skill[]; // sorted by name
  agents: AgentDef[]; // sorted by name
  artefacts: Artefact[]; // sorted by path
  warnings: RegistryWarning[]; // in the order found
};

// A markdown file split into frontmatter and body. `frontmatter` is whatever
// the YAML parsed to (an object, a string, null, …); it is checked later.
export type MarkdownDoc = { path: string; frontmatter: unknown; body: string };

// A markdown file that could not be read or parsed.
export type UnreadableDoc = { path: string; error: string };
