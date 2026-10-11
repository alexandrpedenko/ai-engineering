import { describe, expect, it } from "vitest";
import { diffSnapshots, type Snapshot } from "../../src/domain/outputs";

const snap = (hashes: Record<string, string>, matches: Record<string, string[]> = {}): Snapshot => ({ hashes, matches });

describe("diffSnapshots", () => {
  it("finds created, modified and deleted files, sorted by path, and ignores unchanged ones", () => {
    const before = snap({ "b.md": "1", "c.md": "1", "same.md": "1" });
    const after = snap({ "a.md": "1", "b.md": "2", "same.md": "1" });

    expect(diffSnapshots(before, after, []).writes).toEqual([
      { path: "a.md", change: "created" },
      { path: "b.md", change: "modified" },
      { path: "c.md", change: "deleted" },
    ]);
  });

  it("counts a declared glob as written when any of its files changed", () => {
    const before = snap({ "wiki/a.md": "1" }, { "wiki/**": ["wiki/a.md"] });
    const after = snap({ "wiki/a.md": "1", "wiki/b.md": "1" }, { "wiki/**": ["wiki/a.md", "wiki/b.md"] });

    expect(diffSnapshots(before, after, ["wiki/**"]).missing).toEqual([]);
  });

  it("lists a declared path that didn't change as missing", () => {
    const before = snap({ "req.md": "1" }, { "req.md": ["req.md"], "design.md": [] });
    const after = snap({ "req.md": "2" }, { "req.md": ["req.md"], "design.md": [] });

    expect(diffSnapshots(before, after, ["req.md", "design.md"])).toEqual({
      writes: [{ path: "req.md", change: "modified" }],
      missing: ["design.md"],
    });
  });

  it("counts a deleted declared file as written", () => {
    const before = snap({ "old.md": "1" }, { "old.md": ["old.md"] });
    const after = snap({}, { "old.md": [] });

    expect(diffSnapshots(before, after, ["old.md"]).missing).toEqual([]);
  });
});
