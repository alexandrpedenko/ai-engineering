# ADR-0007 — A step's outputs are checked on disk, not taken from the agent's summary

**Status:** Accepted (2026-10-11). What a snapshot covers is refined by ADR-0014.

## Context

An agent's final message says what it did; it can be wrong ("I've updated
requirements.md" when it wrote `requirements-v2.md`). Local Cursor runs
return no artifacts list (SDK: `downloadArtifact` throws for local). The
gate reviewer and the next step need to know which files really changed.

## Decision

- Before an agent step, `core/outputs` hashes every file matching the step's
  `writes` globs and the project's `artefactGlobs`. After the run it hashes
  them again.
- `StepRecord.writes` is the difference: created, modified, deleted.
  `StepRecord.missing` lists declared `writes` that didn't change.
- A step with a non-empty `missing` is `done` with a warning, not `failed`;
  the gate shows the warning. (An agent may correctly decide a file needs no
  change.)
- For delivery steps (slice 8) the snapshot also takes `git status
  --porcelain` and the diff, so changes outside the declared globs are shown
  too.

## Consequences

- Hashing is cheap at the MVP's scale (markdown folders, a small fixture).
  Large repos may need `git status` instead of hashing; that switch is
  internal to `outputs`.
- Edits a person makes while a step runs show up as the step's changes.
  The MVP accepts this.

## Alternatives considered

- **Parse `tool_call` events for file edits.** The SDK says tool names and
  payloads may change; the file system doesn't.
- **Trust the summary.** That's the problem this ADR exists for.
