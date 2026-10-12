import { useShallow } from "zustand/react/shallow";
import { useWorkflowDraftStore } from "./useWorkflowDraftStore";

// The ids of the workflows that have a draft. Re-renders only when that list changes.
export function useDraftIds(): string[] {
  return useWorkflowDraftStore(useShallow((state) => Object.keys(state.drafts)));
}
