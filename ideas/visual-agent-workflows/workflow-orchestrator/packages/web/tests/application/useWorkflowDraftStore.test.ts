import { beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDraftIds, useWorkflowDraftStore } from "../../src/application/useWorkflowDraftStore";
import { workflow } from "../support/sampleData";

beforeEach(() => {
  useWorkflowDraftStore.setState({ drafts: {}, selected: {} });
});

describe("useWorkflowDraftStore", () => {
  it("keeps a draft per workflow and discards one without touching the others", () => {
    const { setDraft, discard } = useWorkflowDraftStore.getState();
    setDraft("ba-discovery", workflow);
    setDraft("other", { ...workflow, id: "other" });
    discard("ba-discovery");

    expect(Object.keys(useWorkflowDraftStore.getState().drafts)).toEqual(["other"]);
  });

  it("remembers the selected step per workflow", () => {
    const { select } = useWorkflowDraftStore.getState();
    select("ba-discovery", "review");
    select("other", null);

    expect(useWorkflowDraftStore.getState().selected).toEqual({ "ba-discovery": "review", other: null });
  });

  it("drops a draft on save only if it is still the version that was saved", () => {
    const { setDraft, markSaved } = useWorkflowDraftStore.getState();
    const sent = { ...workflow, name: "Sent" };
    setDraft("ba-discovery", sent);
    setDraft("ba-discovery", { ...sent, name: "Edited while saving" });
    markSaved("ba-discovery", sent);
    expect(useWorkflowDraftStore.getState().drafts["ba-discovery"]?.name).toBe("Edited while saving");

    const latest = useWorkflowDraftStore.getState().drafts["ba-discovery"];
    if (latest) markSaved("ba-discovery", latest);
    expect(useWorkflowDraftStore.getState().drafts).toEqual({});
  });

  it("forgets a deleted workflow's draft and selection", () => {
    const { setDraft, select, forget } = useWorkflowDraftStore.getState();
    setDraft("ba-discovery", workflow);
    select("ba-discovery", "review");
    forget("ba-discovery");

    expect(useWorkflowDraftStore.getState()).toMatchObject({ drafts: {}, selected: {} });
  });

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
