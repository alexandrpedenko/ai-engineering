import { Alert, Button, Stack, TextField, Typography } from "@mui/material";
import type { GateFile } from "../domain/gateFileViews";
import { GateFileView } from "./GateFileView";

type Props = {
  files: GateFile[] | undefined; // undefined while loading
  error?: string; // the files couldn't be loaded
  feedback: string;
  sending: boolean;
  onFeedbackChange: (text: string) => void;
  onApprove: () => void;
  onReject: (feedback: string) => void;
  onEditFile: (path: string) => void;
};

// The files a gate asks a person to check, each with what the steps before
// the gate changed (and an Edit button), and their answer. Reject needs feedback.
export function GatePanel({ files, error, feedback, sending, onFeedbackChange, onApprove, onReject, onEditFile }: Props) {
  return (
    <Stack spacing={2} aria-label="gate">
      {error && <Alert severity="error">{error}</Alert>}
      {!files && !error && <Typography color="text.secondary">Loading the changes…</Typography>}
      {files?.length === 0 && <Typography color="text.secondary">No files were changed before this gate.</Typography>}
      {files?.map((file) => (
        <GateFileView key={file.path} file={file} onEdit={() => onEditFile(file.path)} />
      ))}
      <TextField
        label="Feedback (needed to reject)"
        multiline
        minRows={2}
        value={feedback}
        onChange={(event) => onFeedbackChange(event.target.value)}
      />
      <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
        <Button color="error" variant="outlined" disabled={sending || !feedback.trim()} onClick={() => onReject(feedback.trim())}>
          Reject
        </Button>
        <Button color="success" variant="contained" disabled={sending} onClick={onApprove}>
          Approve
        </Button>
      </Stack>
    </Stack>
  );
}
