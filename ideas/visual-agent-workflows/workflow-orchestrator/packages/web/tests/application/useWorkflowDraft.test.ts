import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useWorkflowDraft } from "../../src/application/useWorkflowDraft";
import { useWorkflowDraftStore } from "../../src/application/useWorkflowDraftStore";
import { updateWorkflow } from "../../src/domain/workflowEdits";
import { workflow } from "../support/sampleData";

beforeEach(() => {
  useWorkflowDraftStore.setState({ drafts: {}, selected: {} });
});

describe("useWorkflowDraft", () => {
  it("shows the saved workflow until the first edit, then the draft", () => {
    const { result } = renderHook(() => useWorkflowDraft("ba-discovery", workflow));
    expect(result.current).toMatchObject({ workflow, dirty: false, selectedId: null });

    act(() => result.current.edit((w) => updateWorkflow(w, { name: "Renamed" })));

    expect(result.current.dirty).toBe(true);
    expect(result.current.workflow?.name).toBe("Renamed");
  });

  it("applies edits one after another, each to the latest draft", () => {
    const { result } = renderHook(() => useWorkflowDraft("ba-discovery", workflow));

    act(() => {
      result.current.edit((w) => updateWorkflow(w, { name: `${w.name} 1` }));
      result.current.edit((w) => updateWorkflow(w, { name: `${w.name} 2` }));
    });

    expect(result.current.workflow?.name).toBe("BA discovery 1 2");
  });

  it("keeps the draft when the hook is used again, until discarded", () => {
    const first = renderHook(() => useWorkflowDraft("ba-discovery", workflow));
    act(() => first.result.current.edit((w) => updateWorkflow(w, { name: "Draft" })));
    first.unmount();

    const again = renderHook(() => useWorkflowDraft("ba-discovery", workflow));
    expect(again.result.current.workflow?.name).toBe("Draft");

    act(() => again.result.current.discard());
    expect(again.result.current).toMatchObject({ workflow, dirty: false });
  });

  it("selects a step, and edits nothing while the saved workflow is loading", () => {
    const { result } = renderHook(() => useWorkflowDraft("ba-discovery", undefined));

    act(() => {
      result.current.select("review");
      result.current.edit((w) => updateWorkflow(w, { name: "x" }));
    });

    expect(result.current).toMatchObject({ workflow: undefined, dirty: false, selectedId: "review" });
  });
});
