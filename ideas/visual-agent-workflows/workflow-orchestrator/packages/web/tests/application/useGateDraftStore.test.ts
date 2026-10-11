import { beforeEach, describe, expect, it } from "vitest";
import { useGateDraftStore } from "../../src/application/useGateDraftStore";

beforeEach(() => {
  useGateDraftStore.setState({ drafts: {} });
});

describe("useGateDraftStore", () => {
  it("keeps a draft per run and clears one without touching the others", () => {
    const { setDraft, clearDraft } = useGateDraftStore.getState();
    setDraft("run-1", "add checks");
    setDraft("run-2", "split R3");
    clearDraft("run-1");

    expect(useGateDraftStore.getState().drafts).toEqual({ "run-2": "split R3" });
  });
});
