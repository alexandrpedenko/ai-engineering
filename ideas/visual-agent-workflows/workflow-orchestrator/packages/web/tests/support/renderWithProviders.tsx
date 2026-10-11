import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import type { OrchestratorApi } from "../../src/application/OrchestratorApi";
import { OrchestratorApiContext } from "../../src/application/orchestratorApiContext";
import { FakeOrchestratorApi } from "./FakeOrchestratorApi";

// Wraps a page or hook in the same providers bootstrap/ uses, with a fresh
// query cache (no retries) and the given API (a FakeOrchestratorApi by default).
function providers(api: OrchestratorApi) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <OrchestratorApiContext value={api}>{children}</OrchestratorApiContext>
    </QueryClientProvider>
  );
}

export function renderWithProviders(ui: ReactNode, api: OrchestratorApi = new FakeOrchestratorApi()) {
  return render(ui, { wrapper: providers(api) });
}

export function renderHookWithProviders<T>(hook: () => T, api: OrchestratorApi = new FakeOrchestratorApi()) {
  return renderHook(hook, { wrapper: providers(api) });
}

// Shows where the app navigated to (path and query), for pages that navigate away.
function Location() {
  const { pathname, search } = useLocation();
  return <div data-testid="location">{`${pathname}${search}`}</div>;
}

// Renders `page` at `at`, matched by the route `path` (e.g. "/runs/:runId").
// Any other address renders its pathname in data-testid="location".
export function renderPage(page: ReactNode, options: { path: string; at: string; api?: OrchestratorApi }) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[options.at]}>
      <Routes>
        <Route path={options.path} element={page} />
        <Route path="*" element={<Location />} />
      </Routes>
    </MemoryRouter>,
    options.api,
  );
}
