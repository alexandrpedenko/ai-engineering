# ADR-0008 — TypeScript in three npm workspaces, run from source

**Status:** Accepted (2026-10-11)

## Context

`@cursor/sdk` is TypeScript and Node-only (Node ≥ 22.13). LangGraph has a
TypeScript version. The UI is React + MUI. The folder is copied into other
projects (ADR-0001), so installing it must be a single command with nothing
global beyond Node.

## Decision

- One npm workspace root, three packages: `@orch/core`, `@orch/server`,
  `@orch/web`. npm, not pnpm or yarn, because it ships with Node.
- No build step for `core` and `server`: `tsx` runs them from source, and
  `core`'s `package.json` exports its `src/index.ts`. `web` is served and
  bundled by Vite.
- `tsc --noEmit` (TypeScript 7) is the type check; `moduleResolution:
  "bundler"` everywhere, so imports have no `.js` extensions.
- `vitest` for tests in `core` and `server`.
- `engines.node` is `>=22.13` (the SDK's minimum; its default local store
  needs `node:sqlite`).

## Consequences

- `npm install && npm run dev` is the whole setup in a host project.
- Shipping as an npm package later (ADR-0001 alternative) would need a build
  for `core` and `server`.
- `@langchain/langgraph-checkpoint-sqlite` brings `better-sqlite3`, a native
  module; on a Node version without prebuilt binaries it compiles with the
  platform toolchain.

## Alternatives considered

- **One package.** Fewer files, but nothing stops UI code from importing the
  SDK or LangGraph, and the boundary in ADR-0003 is easiest to keep with a
  package boundary.
- **Python backend (LangGraph Python) + React.** The Cursor SDK is TS-only;
  a Python backend would need a Node sidecar anyway.
