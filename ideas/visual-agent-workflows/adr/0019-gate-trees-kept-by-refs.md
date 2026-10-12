# ADR-0019 — Gate trees are kept alive by refs

**Status:** Accepted (2026-10-12). Refines ADR-0016 ("nothing is left in refs").

## Context

ADR-0016 records the project's files as an unreferenced git tree before each
agent step. `git gc` prunes unreferenced objects after two weeks (at once
with `--prune=now`), so a run left at a gate long enough lost its diffs and
the gate answered 500.

## Decision

- `recordTree(name)` also writes `refs/orchestrator/<name>` pointing at the
  tree, where `name` is `<runId>/<stepId>-<attempt>`.
- Deleting a run deletes `refs/orchestrator/<runId>/`.
- A base tree that is gone anyway gives no diff with reason `no base`.

## Consequences

- The recorded file contents stay in the repository until the run is
  deleted (`wf delete`, or Delete in the web app).
- The refs show up in `git for-each-ref` but in no branch or tag list, and
  are not pushed by a normal `git push`.
