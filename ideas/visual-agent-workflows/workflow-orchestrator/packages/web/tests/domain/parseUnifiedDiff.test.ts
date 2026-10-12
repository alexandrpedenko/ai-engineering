import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "../../src/domain/parseUnifiedDiff";

describe("parseUnifiedDiff", () => {
  it("numbers kept, removed and added lines on both sides", () => {
    const [hunk] = parseUnifiedDiff("@@ -12,3 +12,4 @@ ## Members\n R3 cancel\n-Check: gone\n+Check: gone and free\n+R4 who booked\n");

    expect(hunk?.header).toBe("@@ -12,3 +12,4 @@ ## Members");
    expect(hunk?.lines).toEqual([
      { kind: "context", text: "R3 cancel", oldLine: 12, newLine: 12 },
      { kind: "removed", text: "Check: gone", oldLine: 13, newLine: null },
      { kind: "added", text: "Check: gone and free", oldLine: null, newLine: 13 },
      { kind: "added", text: "R4 who booked", oldLine: null, newLine: 14 },
    ]);
  });

  it("splits several hunks and ignores file headers before the first", () => {
    const text = "diff --git a/a.md b/a.md\n--- a/a.md\n+++ b/a.md\n@@ -1 +1 @@\n-a\n+b\n@@ -40,2 +40,2 @@\n x\n-y\n+z\n";

    const hunks = parseUnifiedDiff(text);

    expect(hunks.map((h) => h.header)).toEqual(["@@ -1 +1 @@", "@@ -40,2 +40,2 @@"]);
    expect(hunks[1]?.lines.map((l) => [l.oldLine, l.newLine])).toEqual([
      [40, 40],
      [41, null],
      [null, 41],
    ]);
  });

  it("keeps '\\ No newline at end of file' as a note with no line numbers", () => {
    const [hunk] = parseUnifiedDiff("@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+a\n");

    expect(hunk?.lines[1]).toEqual({ kind: "note", text: "No newline at end of file", oldLine: null, newLine: null });
    expect(hunk?.lines[2]).toEqual({ kind: "added", text: "a", oldLine: null, newLine: 1 });
  });

  it("numbers a new file's lines from 1", () => {
    const [hunk] = parseUnifiedDiff("@@ -0,0 +1,2 @@\n+one\n+two\n");
    expect(hunk?.lines.map((l) => l.newLine)).toEqual([1, 2]);
  });

  it("gives no hunks for an empty diff", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
  });
});
