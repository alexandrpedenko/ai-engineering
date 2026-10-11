import type { Phase, WorkflowSummary } from "@orch/core";

// One sidebar group: a phase and its workflows. `phase` is null for the
// Unsorted group (no phase, or one that isn't in phases.json).
export type PhaseGroup = { phase: Phase | null; workflows: WorkflowSummary[] };

const byName = (a: WorkflowSummary, b: WorkflowSummary) => a.name.localeCompare(b.name);

// Workflows grouped under their phases, phases in `order` (empty ones kept),
// workflows by name. Unsorted comes last and only when it has workflows.
export function groupWorkflowsByPhase(phases: Phase[], workflows: WorkflowSummary[]): PhaseGroup[] {
  const known = new Set(phases.map((p) => p.id));
  const groups: PhaseGroup[] = [...phases]
    .sort((a, b) => a.order - b.order)
    .map((phase) => ({ phase, workflows: workflows.filter((w) => w.phase === phase.id).sort(byName) }));
  const unsorted = workflows.filter((w) => !w.phase || !known.has(w.phase)).sort(byName);
  if (unsorted.length > 0) groups.push({ phase: null, workflows: unsorted });
  return groups;
}
