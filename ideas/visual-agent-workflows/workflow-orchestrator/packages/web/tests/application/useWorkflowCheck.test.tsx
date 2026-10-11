import type { Workflow } from "@orch/core";
import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorkflowCheck } from "../../src/application/useWorkflowCheck";
import { updateWorkflow } from "../../src/domain/workflowEdits";
import { FakeOrchestratorApi } from "../support/FakeOrchestratorApi";
import { renderHookWithProviders } from "../support/renderWithProviders";
import { workflow } from "../support/sampleData";

afterEach(() => {
  vi.useRealTimers();
});

describe("useWorkflowCheck", () => {
  it("asks nothing for no draft", () => {
    vi.useFakeTimers();
    const api = new FakeOrchestratorApi();
    const { result } = renderHookWithProviders(() => useWorkflowCheck(null, 10), api);

    act(() => vi.advanceTimersByTime(100));

    expect(api.calls).toEqual([]);
    expect(result.current).toEqual({ problems: undefined, checking: false, error: null });
  });

  it("checks a draft once it stops changing, and only the latest version", async () => {
    const api = new FakeOrchestratorApi();
    api.checkProblems = [{ severity: "error", stepId: "elicit", message: "unknown agent" }];
    let draft: Workflow | null = null;
    const { result, rerender } = renderHookWithProviders(() => useWorkflowCheck(draft, 50), api);

    draft = updateWorkflow(workflow, { name: "A" });
    rerender();
    draft = updateWorkflow(workflow, { name: "B" });
    rerender();

    await waitFor(() => expect(result.current.problems).toEqual(api.checkProblems));
    expect(api.checked.map((w) => w.name)).toEqual(["B"]);
    expect(result.current.checking).toBe(false);
  });

  it("checks a draft it starts with at once", async () => {
    const api = new FakeOrchestratorApi();
    renderHookWithProviders(() => useWorkflowCheck(workflow, 50), api);

    await waitFor(() => expect(api.calls).toEqual(["check ba-discovery"]));
  });

  it("says it is checking while the draft is still changing, after an answer has come", async () => {
    const api = new FakeOrchestratorApi();
    let draft: Workflow = workflow;
    const { result, rerender } = renderHookWithProviders(() => useWorkflowCheck(draft, 200), api);
    await waitFor(() => expect(result.current.checking).toBe(false));

    draft = updateWorkflow(workflow, { name: "A" });
    rerender();

    expect(result.current.checking).toBe(true);
    expect(api.calls).toEqual(["check ba-discovery"]);
  });

  it("reports a failed check", async () => {
    const api = new FakeOrchestratorApi();
    api.failures.checkWorkflow = new Error("server down");
    const { result } = renderHookWithProviders(() => useWorkflowCheck(workflow, 10), api);

    await waitFor(() => expect(result.current.error?.message).toBe("server down"));
  });
});
