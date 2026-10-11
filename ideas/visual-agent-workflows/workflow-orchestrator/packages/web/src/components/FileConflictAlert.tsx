import { Alert, Button, Stack } from "@mui/material";

type Props = { busy: boolean; onReload: () => void; onOverwrite: () => void };

// Says the file changed on disk since it was opened, and offers to drop the
// edits and load that version, or to save over it.
export function FileConflictAlert({ busy, onReload, onOverwrite }: Props) {
  return (
    <Alert
      severity="warning"
      action={
        <Stack direction="row" spacing={1}>
          <Button color="inherit" size="small" disabled={busy} onClick={onReload}>
            Reload
          </Button>
          <Button color="inherit" size="small" disabled={busy} onClick={onOverwrite}>
            Overwrite
          </Button>
        </Stack>
      }
    >
      This file changed on disk since you opened it. Reload it (your edits are dropped) or overwrite it with your version.
    </Alert>
  );
}
