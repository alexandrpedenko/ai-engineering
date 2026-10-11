---
title: Project registry
area: project-registry
summary: Finding the host project, reading its skills, agents and artefacts, and letting people edit those files.
code:
  - packages/core/src/domain/config.ts
  - packages/core/src/domain/settings.ts
  - packages/core/src/domain/registry.ts
  - packages/core/src/domain/skill.ts
  - packages/core/src/domain/agentDef.ts
  - packages/core/src/domain/frontmatterFields.ts
  - packages/core/src/application/ProjectFiles.ts
  - packages/core/src/application/scanProject.ts
  - packages/core/src/application/projectFile.ts
  - packages/core/src/infrastructure/loadConfig.ts
  - packages/core/src/infrastructure/frontmatter.ts
  - packages/core/src/infrastructure/FsProjectFiles.ts
depends_on: []
used_by: [workflows, prompts, agent-steps, http-api, cli, composition]
adrs: [1, 5]
specs: [1-registry, 4-server, 5.6-claude-runtime, 5.7-local-settings, 5.8-artefacts-anywhere, 7-file-editor]
updated: 2026-10-11
---

# Project registry

**What it answers:** which project are we working on, and what's in it that
a workflow can use?

## Config and settings

Two files in the orchestrator folder, both optional, unknown keys are errors:

- **`settings.json`** (gitignored; copy `settings.example.json`): this
  machine's choices: `projectRoot`, `runtime`, `models`. Nothing else.
- **`orchestrator.config.json`** (committed): how projects are laid out.

For `projectRoot`, `runtime` and each model the first that is set wins:
**overrides** (`--project`, `ORCH_PROJECT_ROOT`, `ORCH_RUNTIME`, passed in by
the caller) → **settings.json** → **orchestrator.config.json** → **defaults**.
`loadConfig` returns where `projectRoot` and `runtime` came from in
`sources`; the server and `npm run wf` print it at start
(`project /code/booking (settings.json) · runtime claude (settings.json)`).

`loadConfig(orchestratorDir, overrides)` resolves both:

| key | default | relative to |
| --- | --- | --- |
| `projectRoot` | `..` | orchestrator folder |
| `workflowsDir` | `.cursor/workflows` | project root |
| `skillDirs` | `.cursor/skills`, `.agents/skills` | project root |
| `agentDirs` | `.cursor/agents` | project root |
| `artefactGlobs` | unset (every markdown or text file) | project root |
| `runtime` | `cursor` (or `claude`; `ORCH_RUNTIME` overrides) | |
| `models` | `{ cursor: "composer-2.5", claude: "claude-opus-5-5" }` | default model per runtime; an old `defaultModel` is read as `models.cursor` |
| `dataDir` | `.data` | orchestrator folder |

`overrides.projectRoot` / `overrides.dataDir` / `overrides.runtime` win (they come from `--project`,
`ORCH_PROJECT_ROOT`, or tests). A project root that isn't a folder, bad JSON
or a bad key → `InvalidConfigError` naming the file and each key.

## The registry

`scanProject(files)` → `Registry { root, skills, agents, artefacts, warnings }`.

- **Skill**: every `SKILL.md` under a skill dir. Its **name is the folder that
  holds it** (category folders above don't count). Frontmatter `description`
  expected; a frontmatter `name` that differs from the folder is a warning.
- **Agent**: every `*.md` directly in an agent dir. Name from frontmatter
  `name`, else the file name. Optional `model` (`inherit` means "use the
  default").
- **Artefact**: every `*.md`, `*.mdx` or `*.txt` project file outside the
  skill, agent and workflow dirs, with size and mtime; only those matching
  `artefactGlobs` when it is set.
- **Warnings, never errors**: bad YAML, missing description, a duplicate name
  (the first in read order wins; `.cursor/skills` before `.agents/skills`).
- Sorted: skills and agents by name, artefacts by path.

Parsing frontmatter (`parseMarkdown`) is infrastructure; turning parsed
frontmatter into a skill or agent (`toSkill`, `toAgentDef`) is domain.

## The project's files

`ProjectFiles` (port) / `FsProjectFiles` (adapter) also:

- `snapshot(declared)`: a hash of every project file (files over 5 MB:
  `size:mtimeMs`), and which files each declared pattern matched, for the file
  check ([agent-steps](agent-steps.md)).
- `canOpen(path)`: a normalised relative path that is in the project file
  list, whose real location (after symlinks) is inside the project root, and
  that isn't a file that commonly holds credentials (`.env`, `.env.*`,
  `.envrc`, `.npmrc`, `.pypirc`, `.netrc`, `*.pem`, `*.key`, `*.p12`, `*.pfx`,
  `id_rsa*` and other SSH keys, anything under `.ssh/`, `.aws/`, `.gnupg/`).
  Only existing files.
- `readText` / `writeText`, used through `readProjectFile` /
  `writeProjectFile`, which refuse paths `canOpen` refuses and files over 1 MB.
  Both give the file's **version** (the SHA-1 of its bytes), which changes
  whenever the content does. `writeProjectFile(files, path, content,
  baseVersion?)`: with `baseVersion`, a `FileChangedError` (409, carrying the
  current version) when the file on disk is no longer that version; without
  it, it overwrites. Reading the current version and writing are two steps;
  a write landing in between is not caught.

**The project file list** (ADR-0014) is what all three use. When the root is
inside a git work tree that doesn't ignore it: `git ls-files --cached
--others --exclude-standard` (tracked and untracked, gitignored files left
out; deleted entries dropped). Otherwise (no git, not a repository, or a root
the enclosing repository ignores, like `.data/sample-project`): every file
under the root, not following symlinks. Either way `node_modules`, `.git`
and the orchestrator folder are never in it.

## Where to change what

- A new place to look for skills or agents → config default + `FsProjectFiles`.
- What counts as a valid skill/agent file → `toSkill` / `toAgentDef`.
- What a person may open and edit → `FsProjectFiles.canOpen`.
- Which files a snapshot covers → `FsProjectFiles.projectFiles`.

## Tests

`core/tests/domain/{skill,agentDef,config,frontmatterFields}.test.ts`,
`core/tests/application/{scanProject,projectFile}.test.ts`,
`core/tests/infrastructure/{FsProjectFiles,loadConfig,frontmatter}.test.ts`
(on `fixtures/sample-project` and temp copies of it).
