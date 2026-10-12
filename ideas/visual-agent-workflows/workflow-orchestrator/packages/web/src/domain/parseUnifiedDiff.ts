// One line of a diff: kept (context), added, removed, or a note such as
// "\ No newline at end of file". Line numbers are the line's number in the
// file before and after; null on the side the line isn't on.
export type DiffLine = { kind: "context" | "added" | "removed" | "note"; text: string; oldLine: number | null; newLine: number | null };

// A run of changed lines with the context around them. `header` is the
// "@@ -12,7 +12,11 @@" line, including any text git puts after it.
export type DiffHunk = { header: string; lines: DiffLine[] };

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

// Splits a unified diff into hunks and numbers each line on both sides.
// Lines before the first "@@" (file headers) are ignored; "" gives no hunks.
export function parseUnifiedDiff(text: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();

  for (const line of lines) {
    const header = HUNK_HEADER.exec(line);
    if (header) {
      current = { header: line, lines: [] };
      hunks.push(current);
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      continue;
    }
    if (!current) continue;
    const body = line.slice(1);
    if (line.startsWith("+")) current.lines.push({ kind: "added", text: body, oldLine: null, newLine: newLine++ });
    else if (line.startsWith("-")) current.lines.push({ kind: "removed", text: body, oldLine: oldLine++, newLine: null });
    else if (line.startsWith("\\")) current.lines.push({ kind: "note", text: line.slice(2), oldLine: null, newLine: null });
    else current.lines.push({ kind: "context", text: body, oldLine: oldLine++, newLine: newLine++ });
  }
  return hunks;
}
