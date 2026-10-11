import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@mui/material";

type Props = {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null; // why the last attempt failed
  onConfirm: () => void;
  onCancel: () => void;
};

// Asks before something that can't be undone, and says when it failed.
export function ConfirmDialog({ open, title, text, confirmLabel, busy, error, onConfirm, onCancel }: Props) {
  return (
    <Dialog open={open} onClose={onCancel}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{text}</DialogContentText>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button color="error" variant="contained" disabled={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
