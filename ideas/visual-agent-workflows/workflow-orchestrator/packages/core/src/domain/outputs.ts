import { z } from "zod";

// Files and their content hashes at one moment, plus which paths each
// pattern matched (the adapter does the globbing; this module never does).
export type Snapshot = { hashes: Record<string, string>; matches: Record<string, string[]> };

export const FileChange = z.object({ path: z.string(), change: z.enum(["created", "modified", "deleted"]) });
export type FileChange = z.infer<typeof FileChange>;

// What changed between two snapshots, and which declared patterns saw no
// change at all. Looks only at the files the snapshots cover.
export function diffSnapshots(before: Snapshot, after: Snapshot, declared: string[]): { writes: FileChange[]; missing: string[] } {
  const paths = [...new Set([...Object.keys(before.hashes), ...Object.keys(after.hashes)])].sort();
  const writes: FileChange[] = [];
  for (const path of paths) {
    const was = before.hashes[path];
    const now = after.hashes[path];
    if (was === undefined && now !== undefined) writes.push({ path, change: "created" });
    else if (was !== undefined && now === undefined) writes.push({ path, change: "deleted" });
    else if (was !== now) writes.push({ path, change: "modified" });
  }

  const changed = new Set(writes.map((w) => w.path));
  const missing = declared.filter((pattern) => {
    const candidates = [...(before.matches[pattern] ?? []), ...(after.matches[pattern] ?? [])];
    return !candidates.some((path) => changed.has(path));
  });
  return { writes, missing };
}
