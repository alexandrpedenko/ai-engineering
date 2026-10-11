import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from "@mui/material";
import { useId, useState } from "react";
import { idFromName } from "../domain/workflowEdits";
import { workflowIdProblem } from "../domain/workflowGraph";

type Props = {
  phaseName: string; // where the workflow goes, e.g. "Discovery" or "Unsorted"
  takenIds: string[];
  creating: boolean;
  error: string | null;
  onCreate: (workflow: { id: string; name: string }) => void;
  onClose: () => void;
};

// Asks for a new workflow's name and id. The id follows the name until it is
// edited by hand. Can't be closed while the workflow is being created. Mount
// it only while open, so each opening starts empty.
export function NewWorkflowDialog({ phaseName, takenIds, creating, error, onCreate, onClose }: Props) {
  const formId = useId();
  const [name, setName] = useState("");
  const [typedId, setTypedId] = useState<string | null>(null);
  const id = typedId ?? idFromName(name);
  const idProblem = name.trim() === "" && typedId === null ? null : workflowIdProblem(id, takenIds);
  const canCreate = name.trim() !== "" && idProblem === null && !creating;

  return (
    <Dialog open onClose={creating ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>New workflow in {phaseName}</DialogTitle>
      <DialogContent>
        <Stack
          component="form"
          id={formId}
          spacing={2}
          sx={{ pt: 1 }}
          onSubmit={(event) => {
            event.preventDefault();
            if (canCreate) onCreate({ id, name: name.trim() });
          }}
        >
          <TextField autoFocus size="small" label="Name" value={name} onChange={(event) => setName(event.target.value)} />
          <TextField
            size="small"
            label="Id"
            value={id}
            error={idProblem !== null}
            helperText={idProblem ?? `saved as ${id}.json`}
            onChange={(event) => setTypedId(event.target.value)}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={creating} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" form={formId} variant="contained" disabled={!canCreate}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}
