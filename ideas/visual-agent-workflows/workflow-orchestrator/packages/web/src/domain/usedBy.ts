import type { WorkflowSummary } from "@orch/core";
import type { FileKind } from "./fileKind";

// The workflows whose steps use this skill or agent, by name. Artefacts and
// other files are not tracked, so they are used by none.
export function usedBy(file: FileKind, workflows: WorkflowSummary[]): { id: string; name: string }[] {
  if (file.kind !== "skill" && file.kind !== "agent") return [];
  return workflows
    .filter((w) => (file.kind === "skill" ? w.skills : w.agents).includes(file.name))
    .map((w) => ({ id: w.id, name: w.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
