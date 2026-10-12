import type { FileChange } from "./outputs";
import type { RunState } from "./runState";
import type { GateStep, Workflow } from "./workflow";

// How a file differs from the project as it was before a gate's steps ran.
// `diff` is the unified diff's hunks (from the first "@@" line, 3 lines of
// context), or null with the reason there is none.
export type FileDiff = {
  path: string;
  added: number; // lines
  removed: number; // lines
  diff: string | null;
  reason?: "binary" | "too large" | "no git" | "no base" | "secret";
};

export type GateChange = FileChange["change"] | "unchanged";

// What a gate shows for each file: how the steps before it changed the file,
// and the diff.
export type FileChanges = (FileDiff & { change: GateChange })[];

// The steps from the gate's `onReject` step up to the gate, in order, or []
// when following the edges from `onReject` never reaches the gate.
function stepsBefore(workflow: Workflow, gate: GateStep): string[] {
  const next = new Map(workflow.edges.map((edge) => [edge.from, edge.to]));
  const path: string[] = [];
  let id: string | undefined = gate.onReject;
  while (id !== undefined && id !== gate.id && !path.includes(id)) {
    path.push(id);
    id = next.get(id);
  }
  return id === gate.id ? path : [];
}

// One file's change over two steps: created then modified is still created,
// created then deleted is nothing (null), deleted then created is modified.
function combine(earlier: FileChange["change"] | undefined, later: FileChange["change"]): FileChange["change"] | null {
  if (earlier === undefined) return later;
  if (earlier === "created") return later === "deleted" ? null : "created";
  if (earlier === "deleted") return later === "created" ? "modified" : later;
  return later === "deleted" ? "deleted" : "modified";
}

// The files a gate asks the reviewer to read. The gate's own `shows` when it
// has any; otherwise the files created or modified by the agent steps from the
// gate's `onReject` step up to the gate (their latest attempt), in step order,
// each once. Deleted files are left out: there is nothing to read.
export function gateFiles(workflow: Workflow, gate: GateStep, state: RunState): string[] {
  if (gate.shows.length > 0) return gate.shows;

  const files: string[] = [];
  for (const stepId of stepsBefore(workflow, gate)) {
    for (const write of state.steps[stepId]?.writes ?? []) {
      if (write.change !== "deleted" && !files.includes(write.path)) files.push(write.path);
    }
  }
  return files;
}

// Each file a gate lists, with what the agent steps from `onReject` up to the
// gate did to it, taken together (a file one step created and the next
// modified counts as created). With `shows`: those files, "unchanged" when no
// step touched them. Without: every file the steps changed, in the order
// first changed, deleted files last. A file created and then deleted is left out.
export function gateFileChanges(workflow: Workflow, gate: GateStep, state: RunState): { path: string; change: GateChange }[] {
  const net = new Map<string, FileChange["change"] | null>();
  for (const stepId of stepsBefore(workflow, gate)) {
    for (const write of state.steps[stepId]?.writes ?? []) {
      net.set(write.path, combine(net.get(write.path) ?? undefined, write.change));
    }
  }
  if (gate.shows.length > 0) return gate.shows.map((path) => ({ path, change: net.get(path) ?? "unchanged" }));

  const changed = [...net].flatMap(([path, change]) => (change === null ? [] : [{ path, change }]));
  return [...changed.filter((f) => f.change !== "deleted"), ...changed.filter((f) => f.change === "deleted")];
}

// The git tree a gate diffs against: the one recorded before the latest
// attempt of the first agent step from the gate's `onReject` step. null when
// that step hasn't run, recorded no tree, or `onReject` doesn't lead to the gate.
export function diffBaseFor(workflow: Workflow, gate: GateStep, state: RunState): string | null {
  const agentIds = new Set(workflow.steps.filter((s) => s.type === "agent").map((s) => s.id));
  const first = stepsBefore(workflow, gate).find((id) => agentIds.has(id));
  return first === undefined ? null : (state.steps[first]?.baseTree ?? null);
}
