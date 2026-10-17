# workflow-orchestrator — roadmap after the MVP

**Status:** living document. Edit it in place: add, reorder, mark done. When
an item is picked up it gets a spec in `specs/` (and an ADR if it is a
decision), and its line here links to that spec.

The MVP itself (slices 0–8) is planned in [spec.md](spec.md), in the Slices
table. This file starts where that ends. It replaces the "After the MVP"
paragraph in spec.md's Slices section (see spec.md, Amendments,
"roadmap moves to roadmap.md").

## Critical: fix first

0. **Cursor local runs fail with `[internal] unable to open database
   file`.** Seen on Windows: a long BA step wrote its files, then the Cursor
   run ended `ERROR` and the step failed, so the gate never opened. It
   recurs, so a Cursor workflow can't move past a long step.
   - **Which database.** Not `checkpoints.sqlite` (that would throw in the
     server, not come back as the agent's result) and not the host project's
     own knowledge-base SQLite.
     It is the Cursor SDK's own local-agent store, opened with `node:sqlite`
     inside the orchestrator process: `index.db` at
     `~/.cursor/projects/<cwd with every non-alphanumeric run turned into
     "-">/sdk-agent-store/<sha256(cwd)>/`, plus one
     `agents/agent-<sha256(agentId)>/store.db` per agent, opened lazily.
     It is not under `%APPDATA%` / `%LOCALAPPDATA%\Cursor`, and not under the
     project.
   - **Likely cause: Windows' 260-character path limit.** The per-agent
     `store.db` path carries 186 fixed characters (two 64-character hashes,
     plus `-journal` / `-wal` sidecars on top) plus the home folder plus the
     whole project path again as the slug. A project under
     `C:\Users\<name>\Documents\projects\...\my-host-project` lands at
     about 260. Node creates the folders fine (it handles long paths), but
     SQLite's Windows file open does not, unless `LongPathsEnabled` is on, and
     that returns exactly `SQLITE_CANTOPEN`. `index.db` is two levels
     shallower, which is why runs start fine. macOS allows 1024-character
     paths, so the bug doesn't show there.
   - **Confirm on the Windows machine:** compute the per-agent path length
     for the real `cwd`, check `reg query
     HKLM\SYSTEM\CurrentControlSet\Control\FileSystem /v LongPathsEnabled`,
     and look for an `agents\agent-…` folder with no `store.db` in it.
   - **Fix:** pass `local.store` to `Agent.create`, a `SqliteLocalAgentStore`
     opened once with a short `stateRoot` (e.g. under the orchestrator's
     `.data/`), and use the same store in `find()` / `getRun`. Turning on
     `LongPathsEnabled` is a workaround only.
   - **Also:** write the full `RunResult` error (code, message, stack) to
     `server.log`, not only the step summary. Then decide whether a step whose
     required writes exist but whose run ended `ERROR` waits at its gate or
     fails (`runAgentStep.ts`, today it fails).
   - **Unlikely, given the store's real location:** OneDrive or antivirus
     under `Documents` (the store is under `.cursor`), a vanished relative
     path, two servers on one store (that would be `SQLITE_BUSY`), and a
     `tsx watch` restart (that kills the run outright).

## Next, roughly in order

1. **Workflows shared through git.** One BA or designer commits a workflow;
   another pulls, runs and changes it. Workflow files already live in the
   host project (ADR-0001, ADR-0002) and each person runs a local
   orchestrator (ADR-0015). Still needed:
   - merge-friendly workflow files: a stable key order on save, and `layout`
     changes that don't rewrite the whole file (or layout kept separately);
   - portable steps: model ids that work whichever runtime a person chose,
     or a clear problem when they don't (see item 2);
   - a check after `git pull` that names skills and agents a workflow uses
     but this checkout lacks;
   - deciding whether run history is ever shared (today each person's runs
     stay in their own `.data/`).

   Origin: spec.md amendment "roadmap: sharing workflows across a team".
2. **A model picker per runtime.** The Model field offers the models the
   chosen runtime (Cursor or Claude) has, by readable name, instead of free
   text; the list comes from the runtime's SDK where it can list models,
   otherwise from a list kept with the adapter. The server's check warns
   about a model id the current runtime doesn't know. Refines ADR-0013.
   Origin: typing "Opus 5.5" was only caught when the step ran; spec.md
   amendment "roadmap: choosing a model from the runtime's list".
3. **More of each step's work, during and after the run.** Today the run
   view shows, under the running step only, the first line of the agent's
   text and its tool calls; the feed disappears when the step finishes, the
   agent's reasoning ("thinking" events) is never shown, and its final
   message is shown only when the step failed. All of it is already saved
   (the final message in the step's record, every event in the run's event
   log). Wanted:
   - each finished step keeps its final message, its full text and its
     reasoning, collapsed under the step and opened on demand, for every
     attempt (so "I couldn't write the file because…" stays readable);
   - a clear note when a step changed no files at all;
   - a loading indicator on the step that is running, and per-step detail
     the person controls (text, reasoning, tools: show or hide each).

   Origin: a BA step's answer explained why it wrote nothing, and the text
   was gone once the step ended.
4. **Parallel steps on git worktrees.** A workflow forks: two or more agent
   steps run at the same time instead of one after another (e.g. the BA
   writes requirements while the designer drafts flows from the same brief).
   Each runs in its own git worktree, a separate checkout on its own branch,
   so neither sees the other's half-finished edits. A join step merges the
   branches back; the gate after it shows the combined changes, and merge
   conflicts are shown there or handed to an agent to resolve. A worktree per
   step would also allow a step that sees only its listed skills (ADR-0005,
   Alternatives).
5. **Command step.** A step the orchestrator runs itself: a fixed command
   from the workflow (e.g. `npm test`), its output and exit code recorded,
   failing the step on a non-zero exit. Lets a delivery workflow check its
   own work without giving agents a shell (the Claude runtime refuses Bash).
   Origin: slice 8 dropped the "tests check" step for this reason.
6. **Router step.** A step that picks the next step from a condition.
7. **Sub-workflows.** A step that runs another workflow.
8. **Cloud runtime with pull requests.**
9. **Cost per run.** Tokens and money per step and per run.
10. **Workflow templates shared across projects.** Likely needs named
   locations in workflows (`{{paths.kb}}/glossary.md`) mapped once per
   project (ADR-0014, Alternatives).
11. **Phase gates.** Delivery waits until discovery is approved.

12. **A browser end-to-end test.** Playwright against `dev:sample`: start a
   run, watch the feed, read the gate's diff, approve (slice 9, left out).
13. **A live smoke test per runtime.** A one-step workflow on Cursor and on
   Claude behind a flag someone runs by hand, so SDK changes show up before a
   real run (slice 9, left out).
14. **Cheaper change detection in big repositories.** Every step reads and
   hashes the whole project twice; in git, a tree after the step and
   `git diff-tree` could replace both (slice 9, left out).
15. **Windows CI.** Paths and scripts are written for it; nothing runs it yet.

## Parked

- **Settings UI and a project list** ([specs/proposal-settings-and-projects.md](specs/proposal-settings-and-projects.md)).
  Parked for the hand-edited `settings.json` (slice 5.7).

## Done

- **Claude Agent SDK runtime.** Built early, as slice 5.6
  ([specs/5.6-claude-runtime.md](specs/5.6-claude-runtime.md), ADR-0013).
- **Listen on localhost only** (the proposal's open security point). Done in
  slice 5.8, and widened to local, JSON-only requests in ADR-0015.

## Small debts

Known, low-severity, left out of earlier slices on purpose:

- `/api/files` and each editor check rescan the whole project file list; a
  very large repository would make them slow (slice 6 review).
- The inputs list in the editor uses index keys, so removing a row can move
  focus to the wrong one (slice 6 review).
- The web app keeps its own copy of the step-id rule, because it may only
  import types from core (slice 6 review).
- The run page doesn't say when its live connection drops; the browser
  reconnects by itself (slice 9).
- The web app casts `Registry`, `RunDetails` and stream events after a loose
  check; the contract test is what keeps them true (slice 9, I3).
- `npm ls` reports dompurify 3.4.16 as "invalid" against monaco-editor's
  exact 3.4.15, because npm doesn't apply the override; the lockfile pins
  3.4.16 (slice 9).
- 14 lint warnings remain (shadowed names, two effects that set state).
- A licence for the orchestrator: the owner's choice.
