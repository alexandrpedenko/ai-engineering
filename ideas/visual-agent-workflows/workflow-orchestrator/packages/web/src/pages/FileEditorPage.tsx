import { Alert, Box, Button, Chip, Stack, Typography } from "@mui/material";
import type { Registry } from "@orch/core";
import { useNavigate, useSearchParams } from "react-router";
import { useSaveFile } from "../application/mutations";
import { useFile, useProject, useWorkflows } from "../application/queries";
import { useFileDraft } from "../application/useFileDraft";
import { useLeaveWarning } from "../application/useLeaveWarning";
import { CodeEditor } from "../components/CodeEditor";
import { FileConflictAlert } from "../components/FileConflictAlert";
import { FileFacts } from "../components/FileFacts";
import { ApiError } from "../domain/apiError";
import { fileKind } from "../domain/fileKind";
import { languageOf } from "../domain/fileLanguage";
import { usedBy } from "../domain/fileUsage";

const EMPTY_REGISTRY: Registry = { root: "", skills: [], agents: [], artefacts: [], warnings: [] };

// Edits one project file (`?path=`): the text in a code editor, what the file
// is to the orchestrator, Save and Discard. Edits stay in a draft until saved;
// a save that would overwrite a change made on disk meanwhile is refused and
// the page offers to reload or overwrite.
export function FileEditorPage() {
  const [params] = useSearchParams();
  const path = params.get("path") ?? "";
  const file = useFile(path);
  const project = useProject();
  const workflows = useWorkflows();
  const draft = useFileDraft(path, file.data);
  const save = useSaveFile(path);
  const navigate = useNavigate();
  useLeaveWarning(draft.dirty);

  if (file.isPending) return <Typography>Loading…</Typography>;
  if (file.error || draft.content === undefined) return <Alert severity="error">{file.error?.message ?? `Can't open "${path}".`}</Alert>;

  const content = draft.content;
  const registry = project.data ?? EMPTY_REGISTRY;
  const kind = fileKind(path, registry);
  const conflict = save.error instanceof ApiError && save.error.status === 409;
  const send = (overwrite: boolean) =>
    save.mutate(overwrite || draft.baseVersion === undefined ? { content } : { content, baseVersion: draft.baseVersion }, {
      onSuccess: () => draft.markSaved(content),
    });
  const reload = () => {
    draft.discard();
    save.reset();
    void file.refetch(); // never rejects: a failure lands in file.error
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <Typography variant="h6" sx={{ fontFamily: "monospace" }}>
          {path}
        </Typography>
        {draft.dirty && <Chip size="small" label="● unsaved" />}
        <Box sx={{ flexGrow: 1 }} />
        {draft.dirty && (
          <Button
            onClick={() => {
              save.reset();
              draft.discard();
            }}
          >
            Discard changes
          </Button>
        )}
        <Button variant="contained" disabled={!draft.dirty || save.isPending} onClick={() => send(false)}>
          Save
        </Button>
      </Stack>
      {conflict && <FileConflictAlert busy={save.isPending} onReload={reload} onOverwrite={() => send(true)} />}
      {save.error && !conflict && <Alert severity="error">Not saved: {save.error.message}</Alert>}
      <CodeEditor
        value={content}
        language={languageOf(path)}
        label={`Editor for ${path}`}
        onChange={draft.edit}
        onSave={() => {
          if (draft.dirty && !save.isPending) send(false);
        }}
      />
      <FileFacts
        kind={kind}
        usedBy={usedBy(kind, workflows.data ?? [])}
        warnings={registry.warnings.filter((w) => w.path === path).map((w) => w.message)}
        onOpenWorkflow={(id) => navigate(`/workflows/${id}`)}
      />
    </Stack>
  );
}
