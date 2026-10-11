# Slice 1 — registry

**Status:** done (2026-10-11).

**Capability.** Point the orchestrator at a host project and get back what's
in it: its skills, its agents, its artefacts, and a warning for every file it
couldn't use. From the terminal:

```
$ npm run scan -- --project fixtures/sample-project
project    /…/workflow-orchestrator/fixtures/sample-project

skills (2)
  architecture-review       .agents/skills/discovery/architecture-review/SKILL.md
                            Review a proposed architecture against the requirements and name the risks.
  requirements-elicitation  .cursor/skills/requirements-elicitation/SKILL.md
                            Turn a project brief into numbered, testable requirements.

agents (2)
  architect                 .cursor/agents/architect.md          model: inherit
                            Solution architect. Turns requirements into a design and its trade-offs.
  business-analyst          .cursor/agents/business-analyst.md
                            Business analyst. Elicits, writes and refines requirements.

artefacts (2)
  discovery/brief.md        1.1 kB
  wiki/README.md            0.3 kB

warnings (0)
```

`--json` prints the `Registry` as JSON instead. Slices 4–5 serve the same
`Registry` over HTTP and show it in the UI; this slice has no HTTP route and
no web code.

Follows [../spec.md](../spec.md) (Contracts → Registry, Config) and ADRs
0001, 0008, 0010, 0012.

## What gets added

```
packages/core/src/
  domain/
    config.ts               OrchestratorConfig schema (with defaults), ResolvedConfig type
    registry.ts             Skill, AgentDef, Artefact, RegistryWarning, Registry, MarkdownDoc types
    skill.ts                toSkill(doc)
    agentDef.ts             toAgentDef(doc)
  application/
    errors.ts               InvalidConfigError
    ProjectFiles.ts         the ProjectFiles port
    scanProject.ts          scanProject(files)
  infrastructure/
    frontmatter.ts          parseMarkdown(path, text)
    FsProjectFiles.ts       ProjectFiles on the real file system
    loadConfig.ts           loadConfig(orchestratorDir, overrides)
    index.ts                exports the three above
  index.ts                  exports domain + application
packages/server/src/
  cli/
    formatRegistry.ts       formatRegistry(registry) → text
    scanCommand.ts          runScanCommand(argv, deps)
  bin/
    scan.ts                 entry point for `npm run scan`
  composition.ts            + createProjectServices(options)
fixtures/sample-project/    the host used by tests and dev (below)
```

`@orch/core`'s `package.json` gets a second export,
`"./infrastructure": "./src/infrastructure/index.ts"`. `tinyglobby` 0.2.17 is
added to `@orch/core` (artefact globs; Node's own `fs.glob` is still
experimental on the Node 22 line we support).

## Domain (`core/src/domain`)

### `registry.ts`, types only

```ts
type Skill    = { name: string; path: string; description: string; body: string };
type AgentDef = { name: string; path: string; description: string; model?: string; body: string };
type Artefact = { path: string; size: number; mtimeMs: number };
type RegistryWarning = { path: string; message: string };
type Registry = {
  root: string;                    // absolute host root
  skills: Skill[];                 // sorted by name
  agents: AgentDef[];              // sorted by name
  artefacts: Artefact[];           // sorted by path
  warnings: RegistryWarning[];     // in the order found
};

// A markdown file split into its frontmatter and body. `frontmatter` is
// whatever the YAML parsed to: an object, a string, null, … (checked later).
type MarkdownDoc   = { path: string; frontmatter: unknown; body: string };
type UnreadableDoc = { path: string; error: string };
```

All `path`s are relative to the host root, with `/` separators.

### `toSkill(doc: MarkdownDoc): { skill: Skill; warnings: RegistryWarning[] }`

- `name` is the name of the folder holding `SKILL.md`
  (`.agents/skills/discovery/architecture-review/SKILL.md` → `architecture-review`).
  Category folders above it don't count.
- `description` is the frontmatter's `description`.
- Warnings, each with the doc's path; the skill is still returned:
  - frontmatter is not a mapping → `frontmatter is not a key: value mapping`, treated as empty
  - no `description` → `missing description`, description `""`
  - frontmatter `name` differs from the folder → `name "x" differs from folder "y"; using "y"`
- `body` is the text after the frontmatter, trimmed.

### `toAgentDef(doc: MarkdownDoc): { agent: AgentDef; warnings: RegistryWarning[] }`

- `name` is the frontmatter `name`, or the file name without `.md`.
- `model` is the frontmatter `model` if it is a string, otherwise absent.
- Same warnings as skills for a non-mapping frontmatter and a missing description.

### `config.ts`

```ts
const OrchestratorConfig = z.strictObject({
  projectRoot:   z.string().default(".."),
  workflowsDir:  z.string().default(".cursor/workflows"),
  skillDirs:     z.array(z.string()).default([".cursor/skills", ".agents/skills"]),
  agentDirs:     z.array(z.string()).default([".cursor/agents"]),
  artefactGlobs: z.array(z.string()).default(["discovery/**", "wiki/**", "delivery/**", "docs/**"]),
  defaultModel:  z.object({ id: z.string() }).default({ id: "composer-2.5" }),
  dataDir:       z.string().default(".data"),
});

type ResolvedConfig = Omit<z.infer<typeof OrchestratorConfig>, "projectRoot" | "dataDir"> & {
  orchestratorDir: string;   // absolute
  projectRoot: string;       // absolute
  dataDir: string;           // absolute
};
```

`strictObject` makes an unknown key (a typo like `skilDirs`) an error rather
than a silently ignored setting.

## Application (`core/src/application`)

### `ProjectFiles` port

```ts
interface ProjectFiles {
  readonly root: string;
  skillDocs(): Promise<(MarkdownDoc | UnreadableDoc)[]>;   // every SKILL.md under each skillDir, in skillDirs order, then path order
  agentDocs(): Promise<(MarkdownDoc | UnreadableDoc)[]>;   // every *.md directly in each agentDir, same order
  artefacts(): Promise<Artefact[]>;                         // files matching artefactGlobs
}
```

### `scanProject(files: ProjectFiles): Promise<Registry>`

- Runs the three reads, maps docs through `toSkill` / `toAgentDef`, and
  collects their warnings.
- An `UnreadableDoc` becomes a warning (`could not read: <error>`) and no entry.
- Two skills (or two agents) with the same name: the first in read order
  wins; the other becomes a warning `duplicate skill "x" (first: <path>); ignored`.
  Read order puts `.cursor/skills` before `.agents/skills`, matching the
  default config.
- Sorts skills and agents by name, artefacts by path.

### `errors.ts`

`InvalidConfigError extends Error`, carrying the config file path and a list
of `{ key, message }`. The first of the typed errors AGENTS.md describes; the
others arrive with the slices that need them.

## Infrastructure (`core/src/infrastructure`)

### `parseMarkdown(path: string, text: string): MarkdownDoc | UnreadableDoc`

- No leading `---` line → `{ frontmatter: {}, body: text }`.
- Leading `---` … `---` block → parsed with `yaml`; invalid YAML or a missing
  closing `---` → `UnreadableDoc` with the parser's message.
- Handles `\r\n` line endings.

### `FsProjectFiles implements ProjectFiles`

`new FsProjectFiles(config: ResolvedConfig)`.

- Missing skill or agent folders are fine (no docs from them).
- A file that can't be read (permissions) → `UnreadableDoc`.
- `artefacts()` uses `tinyglobby` with `cwd = projectRoot`, `onlyFiles`, `dot:
  false`, and ignores `**/node_modules/**`, `**/.git/**` and the orchestrator
  folder itself when it is inside the host root. Then `stat` for size and
  mtime.

### `loadConfig(orchestratorDir: string, overrides?: { projectRoot?: string }): Promise<ResolvedConfig>`

- Reads `<orchestratorDir>/orchestrator.config.json`; a missing file means all
  defaults. Invalid JSON or a schema error → `InvalidConfigError` naming each
  bad key.
- `projectRoot` precedence: `overrides.projectRoot`, then the config file.
  (The composition root fills `overrides.projectRoot` from `--project` or
  `ORCH_PROJECT_ROOT`; `loadConfig` itself doesn't read the environment.)
- Relative `projectRoot` and `dataDir` resolve against `orchestratorDir`, not
  the current directory (npm workspaces change it).
- A `projectRoot` that doesn't exist or isn't a folder → `InvalidConfigError`.

## Server (`server/src`)

### `cli/formatRegistry.ts`: `formatRegistry(registry: Registry): string`

The text layout shown at the top of this spec: a section per kind with its
count; names padded to one column; descriptions on the next line; agent
`model` when present; artefact sizes in kB with one decimal; warnings as
`path  message`. No colours (they'd break tests and piping).

### `cli/scanCommand.ts`: `runScanCommand(argv, deps): Promise<number>`

```ts
type ScanDeps = {
  scan(options: { projectRoot?: string }): Promise<Registry>;
  write(text: string): void;
  env: { ORCH_PROJECT_ROOT?: string };
};
```

- Flags: `--project <path>`, `--json`, `--help`. Unknown flag → usage text,
  exit code 2.
- `--project` beats `ORCH_PROJECT_ROOT`.
- Writes `formatRegistry(...)` or the JSON; returns `0`.
- `InvalidConfigError` → writes its message and each bad key, returns `1`.
  Any other error is rethrown.

### `composition.ts`: `createProjectServices({ projectRoot? })`

Loads the config from the orchestrator folder (found from this file's
location), creates `FsProjectFiles`, and returns
`{ config, scan: () => scanProject(files) }`. `createApp()` is unchanged.

### `bin/scan.ts`

Calls `runScanCommand(process.argv.slice(2), …)` with real deps and sets
`process.exitCode`. Root script: `"scan": "npm run scan -w @orch/server --"`;
server script: `"scan": "tsx src/bin/scan.ts"`.

### Architecture rules

`tests/architecture.test.ts` learns two server layers:
`server/cli` (adapter, may import `core/index`) and `server/bin` (composition,
like `main.ts`). `tests/guards.test.ts` adds `packages/server/src/cli` to the
folders that need mirrored tests.

## Fixture: `fixtures/sample-project`

A small host that looks like a real one: a BA and an architect working from
a brief.

```
fixtures/sample-project/
  .cursor/skills/requirements-elicitation/SKILL.md
  .agents/skills/discovery/architecture-review/SKILL.md     (category folder + second skill dir)
  .cursor/agents/business-analyst.md                        (no model)
  .cursor/agents/architect.md                               (model: inherit)
  discovery/brief.md                                        a one-page brief for a small booking app
  wiki/README.md                                            "the knowledge base starts here"
  src/index.ts                                              a stub; not an artefact (not in any glob)
```

The skills and agents have real, short instructions (they're what slice 3
sends to Cursor), not lorem ipsum. Broken files are not in the fixture; tests
that need them copy the fixture to a temp folder and add them.

## Tests

| file | checks |
| --- | --- |
| `core/tests/domain/skill.test.ts` | name from folder (incl. a category folder); missing description; frontmatter `name` mismatch; non-mapping frontmatter; body trimmed |
| `core/tests/domain/agentDef.test.ts` | name from frontmatter vs file name; `model` kept only if a string; missing description |
| `core/tests/domain/config.test.ts` | `{}` gives every default; an unknown key fails; a wrong type fails |
| `core/tests/application/scanProject.test.ts` | with a `FakeProjectFiles`: sorting; an unreadable doc becomes a warning; duplicate names keep the first and warn |
| `core/tests/infrastructure/frontmatter.test.ts` | no frontmatter; valid; invalid YAML; unclosed block; `\r\n` |
| `core/tests/infrastructure/FsProjectFiles.test.ts` | the fixture: 2 skill docs in dir order, 2 agent docs, 2 artefacts, `src/` excluded; a temp copy with a broken `SKILL.md`, a missing agent dir, and a `node_modules` folder |
| `core/tests/infrastructure/loadConfig.test.ts` | missing file → defaults; relative paths resolve from the orchestrator dir; `overrides.projectRoot` wins; bad JSON / unknown key / missing root → `InvalidConfigError` |
| `server/tests/cli/formatRegistry.test.ts` | the exact text for a small registry, including a warning and an agent model |
| `server/tests/cli/scanCommand.test.ts` | `--json` vs text; `--project` beats the env; unknown flag → 2; `InvalidConfigError` → 1 with the key named |
| `server/tests/composition.test.ts` | `createProjectServices({ projectRoot: fixture }).scan()` on the real file system: 2 skills, 2 agents, 2 artefacts, 0 warnings |

No web tests: this slice adds no web code (ADR-0012 asks for tests on each
side a feature touches).

## Done when

- `npm run check` passes (type check, the tests above, the architecture and
  guard tests).
- `npm run scan -- --project fixtures/sample-project` prints the output at
  the top of this spec (byte sizes may differ).
- `npm run scan -- --project fixtures/sample-project --json` prints the same
  as JSON.
- `npm run scan -- --project nowhere` exits 1 with a message naming
  `projectRoot`.

## Not in this slice

- Watching files for changes (the UI can re-scan; a watcher comes with the
  server if needed).
- Workflows and phases (slice 2 reads `.cursor/workflows/`).
- Reading `.cursor/rules` or `AGENTS.md` (not needed until prompts, and the
  agent reads them itself; ADR-0005).
- `.env` loading (slice 3, with the API key).

## Amendments

**2026-10-11, slice 1 build — shared frontmatter checks.**
Spec said: `domain/` holds `registry.ts`, `skill.ts`, `agentDef.ts`, `config.ts`.
Now: also `domain/frontmatterFields.ts` (`frontmatterFields(doc)`,
`stringField(fields, key)`), with `core/tests/domain/frontmatterFields.test.ts`.
Why: `toSkill` and `toAgentDef` run the same "is it a mapping" check and the
same trimmed-string read; one copy instead of two.

**2026-10-11, slice 1 build — test for `InvalidConfigError`.**
Spec said: the Tests table lists ten files.
Now: also `core/tests/application/errors.test.ts`.
Why: the guard test (ADR-0012) requires a mirrored test for every file that
exports a class, and `errors.ts` does. The spec's table missed it.

**2026-10-11, slice 1 build — `@orch/server` declares `@orch/core`.**
Spec said: nothing about package dependencies.
Now: `packages/server/package.json` lists `"@orch/core": "*"`.
Why: the server imports it; npm workspaces linked it anyway, but an
undeclared dependency would break once the packages are installed any other way.
