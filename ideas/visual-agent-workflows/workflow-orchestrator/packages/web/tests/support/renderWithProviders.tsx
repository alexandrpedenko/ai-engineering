import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import type { OrchestratorApi } from "../../src/application/OrchestratorApi";
import { OrchestratorApiContext } from "../../src/application/orchestratorApiContext";
import { FakeOrchestratorApi } from "./FakeOrchestratorApi";

// Wraps a page or hook in the same providers app/ uses, with a fresh query
// cache (no retries) and the given API (a FakeOrchestratorApi by default).
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
