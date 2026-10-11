import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  useCancelRun,
  useContinueRun,
  useCreateWorkflow,
  useDeleteWorkflow,
  useResumeRun,
  useRetryRun,
  useSaveFile,
  useSaveWorkflow,
  useStartRun,
} from "../../src/application/mutations";
import { OrchestratorApiContext } from "../../src/application/orchestratorApiContext";
import { queryKeys } from "../../src/application/queryKeys";
import { FakeOrchestratorApi } from "../support/FakeOrchestratorApi";
import { workflow } from "../support/sampleData";

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

describe("workflow file mutations", () => {
  it("useCreateWorkflow and useSaveWorkflow send the workflow and mark the list and the workflow stale", async () => {
    for (const [hook, call] of [
      [useCreateWorkflow, "create"],
      [useSaveWorkflow, "save"],
    ] as const) {
      const { api, client, result } = setup(() => hook());
      if (call === "create") delete api.workflowsById["ba-discovery"];
      client.setQueryData(queryKeys.workflows, []);
      client.setQueryData(queryKeys.workflow("ba-discovery"), {});

      await act(async () => await result.current.mutateAsync(workflow));

      expect(api.calls).toEqual([`${call} ba-discovery`]);
      expect(client.getQueryState(queryKeys.workflows)?.isInvalidated).toBe(true);
      expect(client.getQueryState(queryKeys.workflow("ba-discovery"))?.isInvalidated).toBe(true);
    }
  });

  it("useCreateWorkflow exposes a taken id as an error", async () => {
    const { result } = setup(() => useCreateWorkflow());

    act(() => result.current.mutate(workflow));

    await waitFor(() => expect(result.current.error?.message).toBe('a workflow "ba-discovery" already exists'));
  });

  it("useDeleteWorkflow drops the workflow's query and marks the list stale", async () => {
    const { api, client, result } = setup(() => useDeleteWorkflow("ba-discovery"));
    client.setQueryData(queryKeys.workflows, []);
    client.setQueryData(queryKeys.workflow("ba-discovery"), {});

    await act(async () => await result.current.mutateAsync());

    expect(api.calls).toEqual(["delete ba-discovery"]);
    expect(client.getQueryState(queryKeys.workflow("ba-discovery"))).toBeUndefined();
    expect(client.getQueryState(queryKeys.workflows)?.isInvalidated).toBe(true);
  });
});

describe("useSaveFile", () => {
  it("sends the base version, keeps the saved text and version in the file's cache, and marks the project stale", async () => {
    const { api, client, result } = setup(() => useSaveFile("kb/a.md"));
    api.files["kb/a.md"] = "old";
    client.setQueryData(queryKeys.project, {});

    await act(async () => await result.current.mutateAsync({ content: "new", baseVersion: "v:old" }));

    expect(api.calls).toEqual(["saveFile kb/a.md"]);
    expect(client.getQueryData(queryKeys.file("kb/a.md"))).toEqual({ path: "kb/a.md", content: "new", version: "v:new" });
    expect(client.getQueryState(queryKeys.project)?.isInvalidated).toBe(true);
  });

  it("exposes a file that changed on disk as a 409", async () => {
    const { api, result } = setup(() => useSaveFile("kb/a.md"));
    api.files["kb/a.md"] = "changed elsewhere";

    act(() => result.current.mutate({ content: "mine", baseVersion: "v:old" }));

    await waitFor(() => expect(result.current.error).toMatchObject({ status: 409 }));
    expect(api.files["kb/a.md"]).toBe("changed elsewhere");
  });
});
