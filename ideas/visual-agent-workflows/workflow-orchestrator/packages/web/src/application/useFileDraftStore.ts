import { create } from "zustand";

// An unsaved edit: the text, and the version of the file it started from.
export type FileDraftEntry = { content: string; baseVersion: string };

type FileDraftState = {
  drafts: Record<string, FileDraftEntry>; // by file path
  setDraft: (path: string, draft: FileDraftEntry) => void;
  discard: (path: string) => void;
  // Drops the draft only if its text is still `content` (nothing typed while it was being saved).
  markSaved: (path: string, content: string) => void;
};

// Files being edited and not yet saved. Kept outside the editor page so
// leaving it and coming back keeps the edits. Held in memory only.
export const useFileDraftStore = create<FileDraftState>((set) => ({
  drafts: {},
  setDraft: (path, draft) => set((state) => ({ drafts: { ...state.drafts, [path]: draft } })),
  discard: (path) =>
    set((state) => {
      const { [path]: _, ...rest } = state.drafts;
      return { drafts: rest };
    }),
  markSaved: (path, content) =>
    set((state) => {
      if (state.drafts[path]?.content !== content) return {};
      const { [path]: _, ...rest } = state.drafts;
      return { drafts: rest };
    }),
}));
