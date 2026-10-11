# ADR-0012 — Every feature ships server and web tests; `npm run check` is the gate

**Status:** Accepted (2026-10-11)

## Context

Slices build on each other: the run view (slice 5) depends on the server
routes (slice 4), which depend on the engine (slice 2). A change in a later
slice can quietly break an earlier one. Much of the code is written with an
AI agent, which makes a change look finished before anything checks it. The
project needs checks that run on every change and fail loudly.

## Decision

- **A feature that crosses the HTTP boundary has tests on both sides:**
  - **server**: route tests that call `createApp().request(...)` against
    fake ports (in-memory stores, `FakeAgentRuntime`). They check status
    codes, response bodies and error mapping. No network.
  - **web**: hook tests with a `FakeOrchestratorApi`, and page tests with
    Testing Library that check what the user sees and can do.
  - **core**: domain tests with plain values; use-case tests with fake ports;
    infrastructure tests against `fixtures/sample-project`.
- **Mirrored test files are required.** Every file with behaviour in
  `core/src/{domain,application,infrastructure}`, `server/src/routes`, and
  `web/src/{domain,application,api,pages}` has a test at the same path under
  `tests/`. `tests/guards.test.ts` fails if one is missing. Components are
  tested through the pages that use them.
- **`npm run check` is the gate**: `tsc` over every package, then all vitest
  projects (node and jsdom), including the architecture and guard tests. A
  slice is handed over only with `npm run check` passing, and the handover
  says so.
- No test calls Cursor or a model (ADR-0004).

## Consequences

- Each slice spec lists the tests it adds alongside the code.
- A test that is only there to satisfy the guard is still a test someone
  reads; it should check behaviour, not just import the file.
- Coverage percentages are not a gate. A missing test file is, which is
  easier to act on. Coverage thresholds can be added later if gaps show up.
- End-to-end browser tests (Playwright) are not in the MVP. If page tests
  plus route tests miss real breakages, they are the next step.

## Alternatives considered

- **Coverage threshold (e.g. 80%).** Encourages tests written for the number.
  The mirrored-file rule asks a clearer question: does this unit have tests?
- **A git pre-commit hook.** The orchestrator lives inside other repos
  (ADR-0001) and shouldn't install hooks into them. A CI job running
  `npm run check` is the place for it once there is CI.
