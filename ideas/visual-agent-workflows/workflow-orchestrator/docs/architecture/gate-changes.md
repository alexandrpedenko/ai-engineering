---
title: Changes at a gate
area: gate-changes
summary: How a gate shows what the steps before it changed — a git tree recorded before each agent step, and a diff of each file against it.
code:
  - packages/core/src/application/gateChanges.ts
depends_on: [engine, agent-steps, project-registry]
used_by: [http-api, cli, web-app]
adrs: [7, 16, 19]
specs: [8-changes-at-the-gate, 9-hardening]
updated: 2026-10-12
---

# Changes at a gate

**What it answers:** at a gate, what exactly did the steps before it change,
line by line, and why doesn't the diff include the person's own edits?

## Before each agent step: a tree (ADR-0016)

Next to the hash snapshot ([agent-steps](agent-steps.md)), `runAgentStep`
calls `ProjectFiles.recordTree("<runId>/<stepId>-<attempt>")` before starting
each attempt (a retry of a failed attempt keeps that attempt's tree). In a git
work tree, `FsProjectFiles` writes the project's files as they are now into
the repository as a **tree object** and returns its id:

```
GIT_INDEX_FILE=<dataDir>/tmp/index-<uuid>     ← a temporary index, seeded from the real one
git add -A -- . ':(exclude,glob)**/node_modules/**' ':(exclude)<orchestrator folder>'
git write-tree                                ← the id
rm the temporary index
git update-ref refs/orchestrator/<runId>/<stepId>-<attempt> <id>   ← keeps it past git gc (ADR-0019)
```

The person's index, staged changes, stash, branches and HEAD are not
touched, and no commit is made; the only ref is under `refs/orchestrator/`,
which no branch list shows and a normal push doesn't send. Deleting the run
(`forgetTrees(runId)`) deletes its refs. Gitignored files aren't in the tree.
Staged and untracked changes made before the step count as "before". The id
is kept in the run ref (`baseTree`, so a reattached attempt keeps it) and
in the step's record (`StepRecord.baseTree`, absent when there is no tree).
Outside git, or when the enclosing repository ignores the project (like
`.data/sample-project`), there is no tree.

## At the gate: `gateChanges(deps, runId, gateId)`

```
workflow = the run's saved workflow; gate = its gate step   ← NotFound otherwise
state    = engine.outcome(...).state                        ← NotFound with no state
files    = gateFileChanges(workflow, gate, state)
base     = diffBaseFor(workflow, gate, state)
diffs    = projectFiles.diff(base, files.map(path))
→ [{ path, change, added, removed, diff, reason? }]
```

- **`gateFileChanges`** (domain): with `shows`, those files, `unchanged`
  when no step touched one; without, every file the agent steps from
  `onReject` up to the gate changed (latest attempt), in the order first
  changed, deleted files last. Changes over several steps are taken
  together: created then modified is `created`, deleted then created is
  `modified`, created then deleted is left out.
- **`diffBaseFor`** (domain): the `baseTree` of the first agent step from
  `onReject` up to the gate. After a reject that step runs again, so the gate
  then diffs against the tree from before the **revision**.
- **`FsProjectFiles.diff(base, paths)`**: `base` must be a git object id
  git still has, else every path gets reason `no base`. A path is diffed only
  when a person could open it now (`canOpen`'s rules) or, for a deleted file,
  when the base tree has it; anything else (a gitignored or credential file,
  a link to one) gets reason `secret`. A second temporary index is filled
  from `base` (`git read-tree`), the allowed paths are updated from disk
  (`git update-index --add --remove`), and each is diffed with `git
  --literal-pathspecs diff --cached --relative -U3 <base> -- <path>` (paths
  are never patterns: `a[b].md` is only that file). `diff` is the text from
  the first `@@` line; `added` / `removed` count its `+` / `-` lines. No diff
  (`diff: null`) with a `reason`: `binary`, `too large` (over 200 kB),
  `secret`, `no git` (no base tree), `no base`. An unchanged file has
  `diff: ""`.

It works whether or not the run waits at that gate now.

## Who shows it

- `GET /api/runs/:runId/gates/:gateId/changes` → `{ files }` ([http-api](http-api.md)).
- `npm run wf` prints each file with its change and `+added −removed` at
  every gate ([cli](cli.md)).
- The run page's gate panel: diff by default, Whole file on request
  ([web-app](web-app.md)).

## Tests

`core/tests/domain/gateFiles.test.ts` (`gateFileChanges`, `diffBaseFor`),
`core/tests/application/gateChanges.test.ts`,
`core/tests/infrastructure/FsProjectFiles.test.ts` (trees and diffs in temp
git repositories: nothing the person sees changes; modified, created,
deleted, staged, binary, too large, credential files; a project in a
subfolder; no git; a tree surviving `git gc --prune=now` and forgotten with
its run; a missing or malformed base; literal paths; gitignored files, `.ENV`
and links to credential files), `core/tests/application/runAgentStep.test.ts` (the tree
in the record and the ref), `server/tests/routes/runRoutes.test.ts` (a real
run on a git copy of the fixture, before and after a reject).
