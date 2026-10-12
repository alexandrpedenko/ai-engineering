import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useFile, useFiles, useGateChanges, usePhases, useProject, useRun, useRuns, useWorkflow, useWorkflows } from "../../src/application/queries";
import { ApiError } from "../../src/domain/apiError";
import { FakeOrchestratorApi } from "../support/FakeOrchestratorApi";
import { renderHookWithProviders } from "../support/renderWithProviders";
import { waitingRun } from "../support/sampleData";

async function dataOf<T>(hook: () => { data?: T; isSuccess: boolean }, api = new FakeOrchestratorApi()) {
  const { result } = renderHookWithProviders(hook, api);
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  return result.current.data;
}

describe("read hooks", () => {
  it("load project, phases and workflows", async () => {
    expect((await dataOf(() => useProject()))?.root).toBe("/projects/sample-project");
    expect((await dataOf(() => usePhases()))?.map((p) => p.id)).toEqual(["discovery", "delivery"]);
    expect((await dataOf(() => useWorkflows()))?.map((w) => w.id)).toEqual(["ba-discovery"]);
    expect((await dataOf(() => useWorkflow("ba-discovery")))?.workflow.name).toBe("BA discovery");
  });

  it("load runs, filtered by workflow, and one run", async () => {
    const api = new FakeOrchestratorApi();
    api.runList = [
      { runId: "run-1", workflowId: "ba-discovery", startedAt: "", status: "waiting", busy: false },
      { runId: "run-2", workflowId: "other", startedAt: "", status: "finished", busy: false },
    ];
    api.runsById["run-1"] = waitingRun();

    expect((await dataOf(() => useRuns("ba-discovery"), api))?.map((r) => r.runId)).toEqual(["run-1"]);
    expect((await dataOf(() => useRuns(), api))?.length).toBe(2);
    expect((await dataOf(() => useRun("run-1"), api))?.outcome?.status).toBe("waiting");
  });

  it("report an API error", async () => {
    const api = new FakeOrchestratorApi();
    api.failures.project = new ApiError(500, "internal error");
    const { result } = renderHookWithProviders(() => useProject(), api);
    await waitFor(() => expect(result.current.error?.message).toBe("internal error"));
  });

  it("useFiles loads each file, and reports a missing one", async () => {
    const api = new FakeOrchestratorApi();
    api.files["a.md"] = "A";
    const { result } = renderHookWithProviders(() => useFiles(["a.md", "b.md"]), api);

    await waitFor(() => expect(result.current.every((q) => !q.isPending)).toBe(true));
    expect(result.current[0]?.data?.content).toBe("A");
    expect(result.current[1]?.error).toMatchObject({ status: 404 });
  });

  it("useGateChanges loads a gate's changes, and waits while there is no gate", async () => {
    const api = new FakeOrchestratorApi();
    api.changes["run-1/review"] = [{ path: "a.md", change: "created", added: 1, removed: 0, diff: "@@ -0,0 +1 @@\n+a\n" }];

    expect((await dataOf(() => useGateChanges("run-1", "review"), api))?.map((f) => f.path)).toEqual(["a.md"]);
    const { result } = renderHookWithProviders(() => useGateChanges("run-1", undefined), api);
    expect(result.current.fetchStatus).toBe("idle");
    expect(api.calls.filter((c) => c.startsWith("gateChanges"))).toEqual(["gateChanges run-1 review"]);
  });

  it("useFile loads one file with its version", async () => {
    const api = new FakeOrchestratorApi();
    api.files["kb/a.md"] = "A";
    const { result } = renderHookWithProviders(() => useFile("kb/a.md"), api);

    await waitFor(() => expect(result.current.data).toEqual({ path: "kb/a.md", content: "A", version: "v:A" }));
  });
});
