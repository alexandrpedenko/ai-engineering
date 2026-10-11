# ADR-0016 — A gate's diffs are taken against a git tree recorded before the step

**Status:** Proposed (2026-10-11). Refines ADR-0007 (what is kept before a step).

## Context

ADR-0007 records which files a step changed by hashing them before and
after. A hash says *that* a file changed, not *how*. A reviewer at a gate
needs the how: the lines an agent added to `requirements.md`, the wiki page a
user story edited, the code a delivery step wrote. The gate today shows each
file's whole text.

To diff, the orchestrator needs the files' content from before the step.
Options for keeping it:

- `git diff` against HEAD shows every uncommitted change in the project,
  including the person's own edits and earlier runs, as if the agent made
  them.
- Copying the project (or its text files) before each step costs disk and
  time in proportion to the project, on every attempt.
- `git stash` would change the person's working tree and stash list.

## Decision

- Before each agent step attempt, the orchestrator writes the project's
  working tree (tracked and untracked files, minus gitignored ones and the
  orchestrator folder) into the repository **as a git tree object**, using a
  temporary index file (`GIT_INDEX_FILE`) seeded from the repository's own
  index. Its id is kept with the step's record and its run ref.
- A gate diffs each file it shows against the tree recorded before the first
  agent step it covers (latest attempt), using a second temporary index for
  the working tree at that moment.
- The person's index, staged changes, stash, branches and HEAD are never
  touched. No commit is made.
- A project that isn't a git work tree (or that its enclosing repository
  ignores) has no tree: new files are shown whole, changed files say there is
  no diff, deleted files are listed.

## Consequences

- Only this run's changes appear at a gate, and after a reject only the
  revision's.
- Git stores the file contents as objects (shared with what it already has;
  unchanged files cost nothing). Unreferenced objects are removed by `git gc`
  in time; nothing is left in refs.
- Recording a tree reads the working tree once per attempt; seeding the
  temporary index from the real one lets git skip files whose stat data is
  unchanged.
- The hash snapshot (ADR-0007) stays: it decides which files changed and
  works without git. The tree only adds the "how".

## Alternatives considered

- **Diff against HEAD.** Free, but shows everything uncommitted as the
  agent's work.
- **Copy files before the step.** Works without git, but costs a copy of the
  project per attempt; could be added later for small non-git projects.
- **Commit to a hidden ref per step.** Same objects as a tree, plus a ref to
  clean up; a tree id kept in our own run data is enough.
