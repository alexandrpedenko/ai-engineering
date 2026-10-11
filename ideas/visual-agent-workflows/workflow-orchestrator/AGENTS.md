# Coding rules — workflow-orchestrator

Rules for anyone (person or agent) changing the code in this folder. The
design is in `../spec.md` and `../adr/`; these rules say how code is written.

## Layers (ADR-0010)

Dependencies point inward: **domain → application → adapters**. A file may
import from its own layer and from layers further in, never outward.
`npm test` runs `tests/architecture.test.ts`, which fails on a wrong import.

```
packages/core/src/
  domain/           entities, value types, pure rules. No I/O, no Date.now(), no randomness. Only `zod`.
  application/      use cases (one function per action) and ports (interfaces for the outside world).
  infrastructure/   adapters for ports: file system, Cursor SDK, LangGraph, SQLite.
  index.ts          exports domain + application. Infrastructure via "@orch/core/infrastructure".

packages/server/src/
  routes/           HTTP adapters: parse the request with zod → call a use case → map the result. No logic.
  composition.ts    the only place that creates adapters and wires them into use cases.
  main.ts           starts the server.

packages/web/src/
  domain/           UI-side pure logic and types (e.g. group workflows by phase, workflow ↔ canvas nodes).
  application/      query/mutation hooks (TanStack Query), Zustand stores, query keys, ports
                    (OrchestratorApi). No JSX, no fetch.
  api/              implements OrchestratorApi with fetch / EventSource. The only place that talks HTTP.
  components/       presentational: props in, callbacks out. No application hooks, no api.
  pages/            one per screen: connects application hooks to components.
  bootstrap/        start-up and wiring: mounts React, creates HttpOrchestratorApi + QueryClient and
                    provides them, theme, routing, shell layout. Imports anything; nothing imports it.
```

What goes where, by question:

- Is it true no matter how the app is delivered (CLI, web, tests)? → **domain**.
- Is it "do X for the user" and needs the outside world? → a use case or hook in
  **application**, talking to it through a **port**.
- Does it touch a file, the network, an SDK, the DOM? → an **adapter**.
- Does it decide which adapter is used? → **composition**.

## TypeScript

- `strict` is on. No `any`; use `unknown` and parse it with zod.
- Validate with zod at every boundary: HTTP requests, files read from disk,
  SDK events. Inside the boundary, trust the types.
- Named exports only. Default exports only where a tool requires them
  (`vite.config.ts`).
- `import type` for anything used only as a type. `web` imports from
  `@orch/core` with `import type` only.
- No non-null assertions (`!`) except on the DOM root in `bootstrap/`.
- Imports without file extensions (`moduleResolution: "bundler"`).
- MUI 9 has no system props: layout and typography values (`alignItems`,
  `justifyContent`, `fontWeight`, …) go in `sx`, not on the component.

## Async code

- `async`/`await` with `try`/`catch`, always. **No `.then()`, `.catch()` or
  `.finally()` chains**, in source or tests. `tests/guards.test.ts` fails on one.
- No floating promises: every promise is awaited, returned, or handed to
  something that owns it (a TanStack Query `queryFn`, an event handler that
  awaits inside a `try`).
- A `catch` either adds context and rethrows, or turns the error into a value
  the caller handles. It never swallows.

## State in the web app (ADR-0011)

| state | where | how |
| --- | --- | --- |
| server data (registry, phases, workflows, runs) | TanStack Query cache | `useQuery` / `useMutation` hooks in `application/` |
| client state shared across components (selected phase, canvas draft, dirty flag) | a Zustand store in `application/` | `useXStore` with selectors |
| state one component owns (input text, menu anchor) | `useState` | in that component or page |

- A query hook's `queryFn` and a mutation's `mutationFn` call the
  `OrchestratorApi` port. Never `fetch` outside `api/`.
- Query keys come from `application/queryKeys.ts`; no inline key arrays.
- A mutation invalidates every key it changes, in its `onSuccess`.
- Never copy server data into a Zustand store. Stores hold ids, drafts and UI
  flags.
- Pages and components don't import `@tanstack/react-query` or `zustand`;
  pages use the hooks, components get props.

## Naming and files

- One main export per file; the file is named after it. React components and
  pages are `PascalCase.tsx`; everything else is `camelCase.ts`.
- Use cases are verbs: `scanProject`, `startRun`, `resumeRun`. Ports are
  nouns: `AgentRuntime`, `WorkflowStore`. Adapters say what they adapt:
  `CursorAgentRuntime`, `FsWorkflowStore`, `HttpOrchestratorApi`.
- Hooks are `useX` and live in `web/src/application`.
- Use the spec's vocabulary (host project, skill, agent, artefact, workflow,
  phase, step, run, gate). Don't invent synonyms.

## Errors

- Domain rules return problems as values (`validate()` returns a list).
- Use cases throw the typed errors in `core/src/application/errors.ts`
  (`NotFoundError`, `InvalidInputError`, `ConflictError`).
- Routes map those errors to HTTP status codes in one place. Nothing else
  turns an error into a response.
- Never swallow an error. Catch it only to add context or to turn it into a
  value the caller handles.

## Tests (ADR-0012)

**`npm run check` is the gate**: type check over every package, then every
test, including the architecture and guard tests. Nothing is handed over with
it failing.

- **Every feature has tests on each side it touches.** A feature behind an
  HTTP route has route tests in `server` *and* hook/page tests in `web`.
- **Every file with behaviour has a mirrored test file**:
  `packages/<pkg>/src/a/b.ts` → `packages/<pkg>/tests/a/b.test.ts(x)`, for
  `core` domain/application/infrastructure, `server` routes, and `web`
  domain/application/api/pages. `tests/guards.test.ts` fails if one is
  missing. Components are tested through their pages.
- What each layer's tests use:
  - core domain, web domain: plain values, no fakes.
  - core application: fake ports (in-memory store, `FakeAgentRuntime`).
  - core infrastructure: `fixtures/sample-project`, never the real host.
  - server routes: `createApp().request(...)` with fake ports. No network.
  - web hooks and pages: `renderWithProviders` / `renderHookWithProviders`
    with a `FakeOrchestratorApi` (`packages/web/tests/support/`).
  - web api: `vi.stubGlobal("fetch", ...)`; the only tests that touch `fetch`.
- Page tests check what the user sees and does (Testing Library queries by
  text and role), not component internals.
- **No test calls Cursor or any model** (ADR-0004). No test needs an API key.
- Two vitest projects: `node` (core, server, guards) and `web` (jsdom).

## Comments

- Say what a function does and what it ignores, in plain words. Don't argue
  design decisions in comments; that's what the ADRs are for.
- No commented-out code.

## Dependencies

- Pin exact versions (`npm i --save-exact`).
- A new dependency is named in the slice handover with the reason.
- Libraries are imported only in the layer that's allowed to use them:
  `@cursor/sdk`, `@langchain/*`, `yaml`, `better-sqlite3` in
  `core/src/infrastructure`; `hono` in `server`; `@tanstack/react-query` and
  `zustand` in `web/src/application` (set up in `bootstrap/`); MUI, React Flow and
  Monaco in `web` components, pages and app.

## Working in slices

Work is built in slices from `../spec.md`, one at a time, each with its own
spec in `../specs/` first. A slice leaves `npm run check` passing and lists
the tests it added. Spec changes after a slice is built go in the spec's
`## Amendments` section, not over the original text.
