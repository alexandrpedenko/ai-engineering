import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { useCancelRun, useContinueRun, useResumeRun, useRetryRun, useStartRun } from "../../src/application/mutations";
import { OrchestratorApiContext } from "../../src/application/orchestratorApiContext";
import { queryKeys } from "../../src/application/queryKeys";
import { FakeOrchestratorApi } from "../support/FakeOrchestratorApi";

// Renders a hook with a query client the test can inspect.
function setup<T>(hook: () => T) {
  const api = new FakeOrchestratorApi();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <OrchestratorApiContext value={api}>{children}</OrchestratorApiContext>
    </QueryClientProvider>
  );
  return { api, client, ...renderHook(hook, { wrapper }) };
}

describe("mutation hooks", () => {
  it("useStartRun sends the inputs, returns the run id and marks run lists stale", async () => {
    const { api, client, result } = setup(() => useStartRun("ba-discovery"));
    client.setQueryData(queryKeys.runs(), []);

    let runId = "";
    await act(async () => {
      runId = (await result.current.mutateAsync({ focus: "x" })).runId;
    });

    expect(runId).toBe("run-new");
    expect(api.calls).toEqual(['start ba-discovery {"focus":"x"}']);
    expect(client.getQueryState(queryKeys.runs())?.isInvalidated).toBe(true);
  });

  it("useResumeRun, useContinueRun, useRetryRun and useCancelRun send their action and mark the run stale", async () => {
    const resume = setup(() => useResumeRun("run-1"));
    resume.client.setQueryData(queryKeys.run("run-1"), {});
    await act(async () => await resume.result.current.mutateAsync({ decision: "approve" }));
    expect(resume.api.calls).toEqual(["resume run-1 approve"]);
    expect(resume.client.getQueryState(queryKeys.run("run-1"))?.isInvalidated).toBe(true);

    const continued = setup(() => useContinueRun("run-1"));
    await act(async () => await continued.result.current.mutateAsync());
    expect(continued.api.calls).toEqual(["continue run-1"]);

    const retried = setup(() => useRetryRun("run-1"));
    retried.client.setQueryData(queryKeys.run("run-1"), {});
    await act(async () => await retried.result.current.mutateAsync());
    expect(retried.api.calls).toEqual(["retry run-1"]);
    expect(retried.client.getQueryState(queryKeys.run("run-1"))?.isInvalidated).toBe(true);

    const cancelled = setup(() => useCancelRun("run-1"));
    await act(async () => await cancelled.result.current.mutateAsync());
    expect(cancelled.api.calls).toEqual(["cancel run-1"]);
  });

  it("exposes a failed action's error", async () => {
    const { api, result } = setup(() => useResumeRun("run-1"));
    api.failures.resume = new Error("run is busy");

    act(() => result.current.mutate({ decision: "approve" }));

    await waitFor(() => expect(result.current.error?.message).toBe("run is busy"));
  });
});
