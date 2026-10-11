import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { OrchestratorApiContext } from "../../src/application/orchestratorApiContext";
import { queryKeys } from "../../src/application/queryKeys";
import { useRunEvents } from "../../src/application/useRunEvents";
import type { RunDetails } from "../../src/domain/runView";
import { FakeOrchestratorApi } from "../support/FakeOrchestratorApi";
import { logged, record, runState, waitingRun } from "../support/sampleData";

function setup() {
  const api = new FakeOrchestratorApi();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <OrchestratorApiContext value={api}>{children}</OrchestratorApiContext>
    </QueryClientProvider>
  );
  return { api, client, wrapper };
}

describe("useRunEvents", () => {
  it("replays the run's history from the start, then appends live events once each", () => {
    const { api, wrapper } = setup();
    api.history["run-1"] = logged([{ type: "step-started", stepId: "elicit", attempt: 1 }]);

    const { result } = renderHook(() => useRunEvents("run-1"), { wrapper });
    act(() => {
      api.emit("run-1", 2, { type: "gate-waiting", gateId: "review", shows: [] });
      api.emit("run-1", 2, { type: "gate-waiting", gateId: "review", shows: [] });
    });

    expect(api.calls[0]).toBe("watch run-1 after 0");
    expect(result.current.map((e) => e.seq)).toEqual([1, 2]);
  });

  it("writes the outcome into the run's cache on run-settled and marks run lists stale", () => {
    const { api, client, wrapper } = setup();
    client.setQueryData<RunDetails>(queryKeys.run("run-1"), { ...waitingRun(), busy: true });
    client.setQueryData(queryKeys.runs(), []);
    renderHook(() => useRunEvents("run-1"), { wrapper });

    const outcome = { status: "finished" as const, state: runState() };
    act(() => api.emit("run-1", 5, { type: "run-settled", outcome }));

    expect(client.getQueryData<RunDetails>(queryKeys.run("run-1"))).toMatchObject({ outcome, busy: false });
    expect(client.getQueryState(queryKeys.runs())?.isInvalidated).toBe(true);
  });

  it("marks the run stale when a step finishes", () => {
    const { api, client, wrapper } = setup();
    client.setQueryData(queryKeys.run("run-1"), waitingRun());
    renderHook(() => useRunEvents("run-1"), { wrapper });

    act(() => api.emit("run-1", 1, { type: "step-finished", stepId: "elicit", record: record() }));

    expect(client.getQueryState(queryKeys.run("run-1"))?.isInvalidated).toBe(true);
  });

  it("stops watching when unmounted", () => {
    const { api, wrapper } = setup();
    const { unmount } = renderHook(() => useRunEvents("run-1"), { wrapper });
    unmount();
    expect(api.calls).toContain("stop run-1");
  });
});
