import type { Workflow } from "@orch/core";
import { create } from "zustand";

type WorkflowDraftState = {
  drafts: Record<string, Workflow>; // unsaved edits, by workflow id
  selected: Record<string, string | null>; // the step open in the inspector, by workflow id
  setDraft: (id: string, workflow: Workflow) => void;
  discard: (id: string) => void;
  // Drops the draft only if it is still `saved` (nothing was edited while it was being saved).
  markSaved: (id: string, saved: Workflow) => void;
  // Drops the draft and the selection, for a workflow that no longer exists.
  forget: (id: string) => void;
  select: (id: string, stepId: string | null) => void;
};

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _, ...rest } = record;
  return rest;
}

// Workflows being edited and not yet saved. Kept outside the editor page so
// leaving it and coming back keeps the edits. Held in memory only.
export const useWorkflowDraftStore = create<WorkflowDraftState>((set) => ({
  drafts: {},
  selected: {},
  setDraft: (id, workflow) => set((state) => ({ drafts: { ...state.drafts, [id]: workflow } })),
  discard: (id) => set((state) => ({ drafts: without(state.drafts, id) })),
  markSaved: (id, saved) => set((state) => (state.drafts[id] === saved ? { drafts: without(state.drafts, id) } : {})),
  forget: (id) => set((state) => ({ drafts: without(state.drafts, id), selected: without(state.selected, id) })),
  select: (id, stepId) => set((state) => ({ selected: { ...state.selected, [id]: stepId } })),
}));
