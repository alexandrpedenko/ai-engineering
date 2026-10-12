# Changelog

## 0.9.0 (2026-10-12)

Hardening for real use ([../specs/9-hardening.md](../specs/9-hardening.md)).

- Agents are kept to the project: Cursor agents get no shell, MCP or web
  tools; Claude agents can't read or change the orchestrator folder, agent
  configuration or credential files; any agent that changes a protected file
  fails its step (ADR-0017). Step timeout, Claude turn and budget limits.
- Cancel stops an agent while it works; a run whose process stopped no longer
  shows as moving forever, and can be continued from the web app.
- One run moves at a time in a project, across the CLI and the server
  (ADR-0018). CLI runs appear in the web app.
- Gate diffs survive `git gc` (ADR-0019), read paths literally, and never
  show gitignored or credential files.
- Run data is versioned, written whole and read tolerantly (ADR-0020). Runs
  can be deleted (`wf delete`, Delete run).
- `npm start` serves the built app from one port; graceful shutdown; a JSON
  log in `.data/logs/`; `/api/health` checks git, the data folder and the key.
- `npm run check` adds oxlint and stricter TypeScript flags; tests never read
  `.env`.

## 0.8.0 (2026-10-11)

Changes at the gate: a diff of every file the steps before a gate changed.
