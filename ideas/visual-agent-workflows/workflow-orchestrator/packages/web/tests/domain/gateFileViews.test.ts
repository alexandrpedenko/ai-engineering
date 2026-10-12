import type { FileChanges } from "@orch/core";
import { describe, expect, it } from "vitest";
import { gateFileViews } from "../../src/domain/gateFileViews";

const changes: FileChanges = [
  { path: "a.md", change: "modified", added: 1, removed: 0, diff: "@@" },
  { path: "b.md", change: "created", added: 2, removed: 0, diff: "@@" },
  { path: "c.md", change: "deleted", added: 0, removed: 3, diff: "@@" },
  { path: "d.md", change: "modified", added: 0, removed: 0, diff: null, reason: "binary" },
];

describe("gateFileViews", () => {
  it("joins each file's text, and none for a deleted file", () => {
    const texts: Record<string, { content: string } | { loading: true } | { error: string }> = {
      "a.md": { content: "A" },
      "b.md": { loading: true },
      "c.md": { content: "never shown" },
      "d.md": { error: "File not found." },
    };

    expect(gateFileViews(changes, (path) => texts[path])).toEqual([
      { ...changes[0], content: "A" },
      { ...changes[1], loading: true },
      changes[2],
      { ...changes[3], error: "File not found." },
    ]);
  });
});
