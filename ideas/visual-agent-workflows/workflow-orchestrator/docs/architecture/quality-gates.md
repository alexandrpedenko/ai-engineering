---
title: Quality gates
area: quality-gates
summary: What npm run check enforces — types, tests, layer rules, guards and these docs — and the fakes that keep tests offline.
code:
  - tests/**
  - vitest.config.ts
  - tsconfig.json
  - tsconfig.base.json
  - package.json
  - fixtures/**
  - packages/core/scripts/**
  - .oxlintrc.json
depends_on: []
used_by: []
adrs: [10, 11, 12]
specs: []
updated: 2026-10-12
---

# Quality gates

**What it answers:** what has to pass before a change is done, and what
each check protects.

`npm run check` = `tsc` over every package, then `oxlint`, then every test
(ADR-0012). A slice is handed over only with it passing.

| check | file | protects |
| --- | --- | --- |
| type check | `tsconfig*.json` | strict TypeScript 7 across all packages, plus `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noImplicitOverride`, `noImplicitReturns`, `exactOptionalPropertyTypes` |
| lint | `.oxlintrc.json` (`npm run lint`) | oxlint (typescript-eslint doesn't support TypeScript 7): correctness rules, React hooks, a11y, no `console` outside the server's entry files, no default exports, no import cycles, no `!` outside tests and the DOM root; warnings don't fail |
| contract | `tests/contract.test.ts` | every server answer the web app reads parses with the web's response schemas |
| layer rules | `tests/architecture.test.ts` | every source file is in a known layer; imports only point inward; each layer uses only its allowed packages (ADR-0010) |
| guards | `tests/guards.test.ts` | no `.then` / `.catch` / `.finally` chains; every file with behaviour in the tested folders has a mirrored test file |
| docs | `tests/docs.test.ts` | every source file is described by an architecture doc; every path a doc names exists; frontmatter areas exist |
| unit + integration | `packages/*/tests/**` | behaviour; two vitest projects: `node` (core, server, the checks above) and `web` (jsdom) |

## Fakes, so no test needs a network or a key

- `FakeAgentRuntime` (core infrastructure): scripted agent runs; also used by
  `--fake` and `dev:sample`.
- `MemorySaver` (LangGraph) or SQLite in a temp folder for the engine.
- `tests/support/*` in each package: in-memory run files, event log, workflow
  store, project files, a fake run engine, a fake `OrchestratorApi`, sample
  data, temp copies of `fixtures/sample-project`.

Tests never read a developer's `settings.json` or `.env`: `vitest.config.ts`
sets `ORCH_SETTINGS_FILE` and `ORCH_ENV_FILE` to files that don't exist, so no
test can reach a real model with a developer's key.

`fixtures/sample-project` is a small host project (three skills, three
agents, a brief, a wiki page, the BA and delivery workflows). Tests never edit it; they copy it.

`npm run smoke` (`packages/core/scripts/smoke.ts`) checks the SDK and
LangGraph load, with no key.
