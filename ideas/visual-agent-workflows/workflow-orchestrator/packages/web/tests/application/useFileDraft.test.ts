import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useFileDraft } from "../../src/application/useFileDraft";
import { useFileDraftStore } from "../../src/application/useFileDraftStore";

beforeEach(() => {
  useFileDraftStore.setState({ drafts: {} });
});

const loaded = { content: "# A", version: "v1" };

describe("useFileDraft", () => {
  it("shows the loaded file until the first edit, which keeps the version it started from", () => {
    const { result, rerender } = renderHook(({ file }) => useFileDraft("a.md", file), { initialProps: { file: loaded } });
    expect(result.current).toMatchObject({ content: "# A", baseVersion: "v1", dirty: false });

    act(() => result.current.edit("# A!"));
    rerender({ file: { content: "# A from disk", version: "v2" } });

    expect(result.current).toMatchObject({ content: "# A!", baseVersion: "v1", dirty: true });
  });

  it("discards back to the loaded file, and edits nothing while it loads", () => {
    const { result } = renderHook(() => useFileDraft("a.md", loaded));
    act(() => result.current.edit("x"));
    act(() => result.current.discard());
    expect(result.current).toMatchObject({ content: "# A", dirty: false });

    const loading = renderHook(() => useFileDraft("b.md", undefined));
    act(() => loading.result.current.edit("x"));
    expect(loading.result.current).toMatchObject({ content: undefined, dirty: false });
  });
});
