import type { Workflow } from "@orch/core";
import { useWorkflowDraftStore } from "./useWorkflowDraftStore";

export type WorkflowDraft = {
  workflow: Workflow | undefined; // the draft, else the saved workflow (undefined while it loads)
  dirty: boolean; // there are unsaved edits
  selectedId: string | null;
  // Replaces the draft with `change` applied to the latest draft (or to the
  // saved workflow when there is none yet). Does nothing while it loads.
  edit: (change: (workflow: Workflow) => Workflow) => void;
  select: (stepId: string | null) => void;
  discard: () => void;
  markSaved: (saved: Workflow) => void;
  forget: () => void;
};

// The editor's view of one workflow: the unsaved draft when there is one,
// otherwise `saved`.
export function useWorkflowDraft(id: string, saved: Workflow | undefined): WorkflowDraft {
  const draft = useWorkflowDraftStore((state) => state.drafts[id]);
  const selectedId = useWorkflowDraftStore((state) => state.selected[id] ?? null);
  const { setDraft, discard, markSaved, forget, select } = useWorkflowDraftStore.getState();

  return {
    workflow: draft ?? saved,
    dirty: draft !== undefined,
    selectedId,
    edit: (change) => {
      const current = useWorkflowDraftStore.getState().drafts[id] ?? saved;
      if (current) setDraft(id, change(current));
    },
    select: (stepId) => select(id, stepId),
    discard: () => discard(id),
    markSaved: (workflow) => markSaved(id, workflow),
    forget: () => forget(id),
  };
}
