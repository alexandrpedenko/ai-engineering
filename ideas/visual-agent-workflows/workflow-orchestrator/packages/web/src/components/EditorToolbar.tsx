import { Box, Button, Chip, Stack, Typography } from "@mui/material";

type Props = {
  name: string;
  dirty: boolean;
  saving: boolean;
  onBack: () => void;
  onDiscard: () => void;
  onDelete: () => void;
  onSave: () => void;
};

// The editor's header: the workflow's name, whether it has unsaved edits, and
// what can be done with them.
export function EditorToolbar({ name, dirty, saving, onBack, onDiscard, onDelete, onSave }: Props) {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
      <Typography variant="h5">{name}</Typography>
      {dirty && <Chip size="small" label="● unsaved" />}
      <Box sx={{ flexGrow: 1 }} />
      <Button onClick={onBack}>Back to workflow</Button>
      {dirty && <Button onClick={onDiscard}>Discard changes</Button>}
      <Button color="error" onClick={onDelete}>
        Delete
      </Button>
      <Button variant="contained" disabled={!dirty || saving} onClick={onSave}>
        Save
      </Button>
    </Stack>
  );
}
