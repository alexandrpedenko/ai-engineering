# ADR-0010 — Clean Architecture layers, with dependencies pointing inward

**Status:** Proposed (2026-10-11)

## Context

The codebase will grow slice by slice, much of it written with an AI agent.
Without a fixed shape, business rules (what a valid workflow is, how a step
becomes a prompt, what a gate decision does) end up spread across React
components, HTTP handlers and SDK callbacks, where they can't be tested
without a browser, a server or an API key. The agent SDK and the engine are
also expected to change (ADR-0003, ADR-0004), and that change should stay in
one place.

## Decision

Every package is split into layers. A layer may import only from itself and
from layers further in. The flow is **domain → application (services, use
cases, hooks) → adapters (API methods, infrastructure, views)**.

| layer | `core` / `server` | `web` | may import |
| --- | --- | --- | --- |
| domain | `core/src/domain` | `web/src/domain` | nothing outside its layer; `zod` only |
| application | `core/src/application` (use cases + ports) | `web/src/application` (hooks, stores + ports) | domain; `react`, `@tanstack/react-query`, `zustand` in `web` (ADR-0011) |
| adapters | `core/src/infrastructure`, `server/src/routes` | `web/src/api`, `web/src/components`, `web/src/pages` | application, domain, libraries |
| composition | `server/src/composition.ts`, `server/src/main.ts` | `web/src/app` | everything |

- **Ports** are interfaces in the application layer (`AgentRuntime`,
  `WorkflowStore`, `ProjectFiles`, `OrchestratorApi`). Adapters implement
  them. Only the composition layer creates adapters and passes them in.
- **`web` follows the same rule:** hooks call the `OrchestratorApi` port, not
  `fetch`; `web/src/api` implements it; `app/` provides it through React
  context. Components get data through props and report actions through
  callbacks; they don't call hooks from `application`. Pages connect hooks to
  components.
- `web` imports from `@orch/core` with `import type` only: types and nothing
  that runs.
- An **architecture test** (`tests/architecture.test.ts`, part of `npm test`)
  reads every import in `packages/*/src` and fails on an import that breaks
  the table.
- The coding rules in `workflow-orchestrator/AGENTS.md` spell this out for
  people and agents working on the code.

## Consequences

- Domain and application code is tested with plain inputs and fake ports;
  no file system, server, browser or API key.
- Swapping the Cursor SDK or LangGraph touches `core/src/infrastructure` and
  `server/src/composition.ts` only.
- More files than a "fetch in the component" app. Small slices keep that
  readable.
- `typescript-eslint` 8.x supports TypeScript only below 6.1, so ESLint
  can't check this on TypeScript 7. The architecture test does it with no
  extra dependency; ESLint can be added when it supports TS 7.

## Alternatives considered

- **Feature folders** (`workflows/`, `runs/`, each with its own UI, API and
  logic). Good for large teams; here it hides the dependency direction this
  ADR is about. Features can be added *inside* each layer later.
- **Hooks call `fetch` directly.** Common in React apps; makes every hook
  test mock `fetch` and ties hooks to the HTTP shape.
- **`dependency-cruiser` for the checks.** Capable, but another tool and
  config to learn for a rule that fits in one test file.
