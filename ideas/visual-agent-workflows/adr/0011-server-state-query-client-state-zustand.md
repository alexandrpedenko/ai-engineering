# ADR-0011 — TanStack Query for server data, Zustand for client state, async/await only

**Status:** Accepted (2026-10-11)

## Context

The web app has two kinds of state that behave differently:

- **Server data**: the registry, phases, workflows, runs. It lives on the
  server; the browser holds a copy that goes stale. It needs loading and
  error states, caching, refetching after a change ("saved a workflow → the
  list is out of date"), and, for runs, live updates from SSE.
- **Client state**: what exists only in the browser: the selected phase, the
  workflow being edited on the canvas before it's saved (nodes, selection,
  dirty flag, later undo), panel open/closed.

Writing our own request hook covers loading/error for one call but not
caching, de-duplication, invalidation or cache updates from SSE; each of
those would be reinvented in every hook. Keeping the canvas draft in
`useState` inside a page means passing it through many components, and React
Flow's own docs suggest an external store for that.

## Decision

- **Server data → TanStack Query** (`@tanstack/react-query` 5). Every server
  read is a `useQuery` hook and every write a `useMutation` hook in
  `web/src/application`. Their `queryFn` / `mutationFn` call the
  `OrchestratorApi` port, never `fetch`. Query keys live in one file,
  `application/queryKeys.ts`. A mutation invalidates the keys it changes. SSE
  events (slice 4) update the cache with `queryClient.setQueryData`.
- **Client state → Zustand** (`zustand` 5). One store per concern
  (`useEditorStore`, `useUiStore`), created in `web/src/application`. The
  first store comes with the shell in slice 5. Server data is never copied
  into a store; a store holds ids and drafts, and reads come from the query
  cache.
- **Plain `useState`** for state one component owns (a text field, a menu
  anchor).
- **Async code uses `async`/`await` with `try`/`catch`.** `.then()`,
  `.catch()` and `.finally()` chains are not used anywhere, including tests.
  `tests/guards.test.ts` fails on one.
- Pages and components never import TanStack Query or Zustand. Pages call the
  hooks; components get props.

## Consequences

- Loading, error and refetch behaviour is the same in every screen, set once
  in `bootstrap/queryClient.ts` (no refetch on window focus; 30 s stale time).
- Hook tests render with a fresh `QueryClient` and a `FakeOrchestratorApi`
  (`tests/support/renderWithProviders.tsx`); no network, no mocking of
  `fetch` outside the `api/` tests.
- Two small libraries (TanStack Query about 13 kB gzipped, Zustand about
  1 kB). Both are allowed only in `web/src/application` (and set up in `bootstrap/`);
  the architecture test enforces it.

## Alternatives considered

- **Our own `useApiRequest` hook.** Fine for one screen; loses caching,
  de-duplication and invalidation, and those are what make the run views and
  the editor consistent with each other.
- **SWR.** Similar for reads; weaker mutation and cache-update support, which
  the gate and the editor need.
- **Redux Toolkit + RTK Query.** One tool for both kinds of state, but more
  ceremony than this app needs.
- **Zustand for server data too.** Then caching, staleness and refetching
  are ours to write again.
