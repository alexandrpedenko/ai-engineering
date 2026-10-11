# ADR-0014 — Skills decide where artefacts go; the orchestrator watches the whole project

**Status:** Accepted (2026-10-11). Refines ADR-0007 (what a snapshot covers).

## Context

The orchestrator was built around one project layout: `artefactGlobs`
defaults to `discovery/**`, `wiki/**`, `delivery/**`, `docs/**`, and those
globs decide which artefacts the project view lists, which files `/api/files`
opens, and which files the before/after snapshot of a step covers
(ADR-0007).

Real projects aren't laid out like that, and the orchestrator can't make
them be:

- The same kind of folder has different names: `wiki/`, `knowledge-base/`,
  `kb/`.
- **Where a step's output goes is decided by the skill, not by the
  workflow.** A BA skill writes `prd.md` where its instructions say; a
  designer skill writes user flows into `ux-space/`. The workflow only picks
  the agent and the skill.
- In delivery, an agent changes source code anywhere in the repo. The
  delivery skills and the project's own rules (`.cursor/rules`, `CLAUDE.md`,
  `AGENTS.md`) describe the codebase; the orchestrator can't.

With globs, a file written outside them is invisible: it isn't listed, the
gate can't show it, and the step's record says it changed nothing. Goal 1 of
the spec ("lists the project's artefacts with no setup") holds only for
projects shaped like our fixture.

## Decision

- **Where content goes is the skill's business.** A step's `writes` and
  `reads` stay in the workflow file, but they are optional. When a step names
  its `writes`, it is a promise that is checked (`missing`, ADR-0007) and the
  prompt still says "you must write". When it names none, the agent writes
  where its skills and the project's rules say, and the prompt says so.
- **The snapshot covers the whole project, not globs.** Before and after an
  agent step, the orchestrator hashes every file in the project except
  `.git/`, `node_modules/`, the orchestrator folder and, in a git repository,
  everything `.gitignore` excludes (the file list comes from
  `git ls-files --cached --others --exclude-standard`). A host that isn't a
  git repository is walked with the same fixed exclusions.
  `StepRecord.writes` is what changed, wherever it is.
- **A gate with no `shows` shows what was changed.** By default it lists the
  files created or modified by the agent steps from its `onReject` step up to
  the gate, in their latest attempt. An explicit `shows` still wins.
- **`artefactGlobs` becomes optional.** When it is unset, the project view
  lists every markdown or text file in the project outside the skill, agent
  and workflow folders. When it is set, it only narrows that list. It no
  longer affects what a step's snapshot covers.
- **File access follows the same project file list, on localhost only.**
  `/api/files` opens any file in that list except `.env` and `.env.*`, up to
  1 MB. Gitignored files stay out of reach. Because the reachable set grows,
  the server listens on `127.0.0.1` only.

## Consequences

- A project with `kb/`, `ux-space/` or any other layout works with no
  orchestrator config. Paths live in exactly two places: the skills, and
  (optionally) a workflow step that wants to check a specific file.
- A step's record is more honest. If a skill wrote to the wrong place, the
  gate shows the file where it really landed.
- **A person's own edits made during a step are counted as the step's**
  (ADR-0007 accepted this for the artefact folders). With the whole project
  watched, that also includes code edited in the IDE during a discovery run.
  This is still accepted; the gate shows the file, and the person knows what
  they changed.
- Hashing a large repository per step costs more. The file list comes from
  git, so build output and dependencies are skipped. Files over 5 MB are
  compared by size and modification time instead of by content. Run refs
  hold the "before" snapshot, so they grow with the project (roughly 80
  bytes per file).
- The slice 6 editor doesn't need path pickers for `writes` and `shows` to
  be usable. Both may be left empty.
- Slice 8 (delivery) gets changed code files in `StepRecord.writes` without
  extra work. Its unified diff still comes from git.

## Alternatives considered

- **Named locations in settings** (`{ "wiki": "kb", "discovery": "docs/discovery" }`).
  This fixes renamed folders but not the real problem: a skill can write to
  a folder nobody configured, and code can change anywhere. It's still useful
  later, for workflows shared across projects (`{{paths.kb}}`), but not as
  the way outputs are found.
- **Require every step to declare `writes`.** That forces a workflow author
  to repeat what the skill already says, and the two drift apart.
- **Ask the agent which files it changed.** ADR-0007 already rejects this:
  the summary can be wrong, and tool-call payloads aren't stable.
- **`git status` only, with no hashing.** This misses a second change to a
  file that was already dirty before the step. Hashing the git-listed files
  catches it.
