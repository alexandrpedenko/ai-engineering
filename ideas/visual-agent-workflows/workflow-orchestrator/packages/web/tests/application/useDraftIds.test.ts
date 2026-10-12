import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useDraftIds } from "../../src/application/useDraftIds";
import { useWorkflowDraftStore } from "../../src/application/useWorkflowDraftStore";
import { workflow } from "../support/sampleData";

beforeEach(() => {
  useWorkflowDraftStore.setState({ drafts: {}, selected: {} });
});

describe("useDraftIds", () => {
  it("lists the ids that have drafts, keeping the same list while only a draft's content changes", () => {
    const { result } = renderHook(() => useDraftIds());
    expect(result.current).toEqual([]);

    renderHook(() => useWorkflowDraftStore.getState().setDraft("ba-discovery", workflow));
    const first = result.current;
    renderHook(() => useWorkflowDraftStore.getState().setDraft("ba-discovery", { ...workflow, name: "x" }));

    expect(first).toEqual(["ba-discovery"]);
    expect(result.current).toBe(first);
  });
});
