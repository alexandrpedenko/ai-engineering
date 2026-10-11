import { beforeEach, describe, expect, it } from "vitest";
import { useFileDraftStore } from "../../src/application/useFileDraftStore";

beforeEach(() => {
  useFileDraftStore.setState({ drafts: {} });
});

describe("useFileDraftStore", () => {
  it("keeps a draft per path and discards one without touching the others", () => {
    const { setDraft, discard } = useFileDraftStore.getState();
    setDraft("a.md", { content: "A", baseVersion: "v1" });
    setDraft("b.md", { content: "B", baseVersion: "v1" });
    discard("a.md");

    expect(useFileDraftStore.getState().drafts).toEqual({ "b.md": { content: "B", baseVersion: "v1" } });
  });

  it("drops a draft on save only if its text is still what was saved", () => {
    const { setDraft, markSaved } = useFileDraftStore.getState();
    setDraft("a.md", { content: "typed after saving", baseVersion: "v1" });
    markSaved("a.md", "sent");
    expect(useFileDraftStore.getState().drafts["a.md"]?.content).toBe("typed after saving");

    markSaved("a.md", "typed after saving");
    expect(useFileDraftStore.getState().drafts).toEqual({});
  });
});
