# ADR-0018 — One moving run per project, across processes

**Status:** Accepted (2026-10-12). Found in the slice 9 architecture review.

## Context

A step's changes are read from the whole project (ADR-0007, ADR-0014) and its
gate diffs against a tree of the whole project (ADR-0016). Two runs moving in
one project at once record each other's edits as their own. The CLI and the
server share the data folder but knew nothing of each other: both could move
the same run, and each saw the other's live run as "interrupted".

## Decision

- At most **one run moves per project**. Starting, resuming, continuing or
  retrying another while one moves is refused (409 / a CLI message naming
  the moving run). Runs waiting at a gate don't count.
- Every process takes a **lease** before moving a run: `<dataDir>/project.lock`
  holds `{ pid, runId, since }`, created exclusively. A lease whose process is
  gone is taken over. It is released when the run stops moving.
- The CLI moves runs through the same `RunSupervisor` as the server, so CLI
  runs have an event log and the web app can follow them.
- A run that isn't moving in any process but whose event log ends mid-step
  gets a `run-crashed` event when someone watches it.

## Consequences

- No parallel runs in one project until steps run in their own worktrees
  (roadmap); that work replaces this rule with a per-worktree lease.
- A lease left by a process that died is taken over on the next action; a
  pid reused by an unrelated process could block until that process ends
  (rare; deleting the file fixes it).
