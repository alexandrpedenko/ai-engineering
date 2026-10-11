import { create } from "zustand";

type GateDraftState = {
  drafts: Record<string, string>; // by run id
  setDraft: (runId: string, text: string) => void;
  clearDraft: (runId: string) => void;
};

// The feedback a person is typing at a run's gate. Kept outside the page so
// live updates and leaving the page don't erase it.
export const useGateDraftStore = create<GateDraftState>((set) => ({
  drafts: {},
  setDraft: (runId, text) => set((state) => ({ drafts: { ...state.drafts, [runId]: text } })),
  clearDraft: (runId) =>
    set((state) => {
      const { [runId]: _, ...rest } = state.drafts;
      return { drafts: rest };
    }),
}));
