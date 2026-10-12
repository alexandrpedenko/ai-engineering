# ADR-0020 — Stored run data is versioned, parsed, and read tolerantly

**Status:** Accepted (2026-10-12). Found in the slice 9 reviews.

## Context

Run data lives in `run.json`, refs, `events.jsonl` and LangGraph's
checkpoints. Some of it was cast instead of parsed, files were written in
place (a crash left half a file), and one unreadable file broke the whole
runs list or a run for good. Nothing said which format a file was in.

## Decision

- `run.json` and refs carry `formatVersion: 1`; a file without one is
  version 1. A later format change adds an upgrade step on read.
- Everything read back is parsed with zod, checkpoint state included; old
  field names (`cursorRunIds`, `cursorRunId`) are read and converted to the
  new ones (`agentRunIds`, `agentRunId`).
- JSON files are written to a temporary file and renamed into place.
- A torn last line of an event log is skipped; an unreadable run is left out
  of the runs list instead of failing it.

## Consequences

- An old checkpoint or event keeps working after a field rename, as long as
  its upgrade is written.
- A run whose `run.json` can't be read disappears from the list; its folder
  stays until deleted.
