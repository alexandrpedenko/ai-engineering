import type { FileChanges } from "@orch/core";

// A file's whole text as far as it has loaded.
export type FileText = { loading: true } | { error: string } | { content: string };

// One file at a gate: its change and diff, plus its whole text when loaded.
export type GateFile = FileChanges[number] & { content?: string; error?: string; loading?: boolean };

// The gate's files with their whole text joined in. A deleted file gets no
// text; a file whose text isn't asked for yet is shown without one.
export function gateFileViews(changes: FileChanges, textOf: (path: string) => FileText | undefined): GateFile[] {
  return changes.map((file) => {
    const text = file.change === "deleted" ? undefined : textOf(file.path);
    return text ? { ...file, ...text } : file;
  });
}
