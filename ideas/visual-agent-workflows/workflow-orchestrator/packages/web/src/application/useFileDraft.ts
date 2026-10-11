import { useFileDraftStore } from "./useFileDraftStore";

export type FileDraft = {
  content: string | undefined; // the draft, else the loaded text (undefined while it loads)
  baseVersion: string | undefined; // the version the draft started from, else the loaded version
  dirty: boolean;
  edit: (content: string) => void;
  discard: () => void;
  markSaved: (content: string) => void;
};

// The editor's view of one file: the unsaved draft when there is one,
// otherwise the loaded file. The first edit starts the draft from the loaded
// version, so a save can tell whether the file changed on disk meanwhile.
export function useFileDraft(path: string, loaded: { content: string; version: string } | undefined): FileDraft {
  const draft = useFileDraftStore((state) => state.drafts[path]);
  const { setDraft, discard, markSaved } = useFileDraftStore.getState();
  return {
    content: draft?.content ?? loaded?.content,
    baseVersion: draft?.baseVersion ?? loaded?.version,
    dirty: draft !== undefined,
    edit: (content) => {
      const baseVersion = useFileDraftStore.getState().drafts[path]?.baseVersion ?? loaded?.version;
      if (baseVersion !== undefined) setDraft(path, { content, baseVersion });
    },
    discard: () => discard(path),
    markSaved: (content) => markSaved(path, content),
  };
}
