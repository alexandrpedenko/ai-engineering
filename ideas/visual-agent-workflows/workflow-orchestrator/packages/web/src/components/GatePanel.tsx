import { Button, Stack, TextField, Typography } from "@mui/material";
import { FileView } from "./FileView";

export type GateFile = { path: string; content?: string; error?: string; loading?: boolean };

type Props = {
  files: GateFile[];
  feedback: string;
  sending: boolean;
  onFeedbackChange: (text: string) => void;
  onApprove: () => void;
  onReject: (feedback: string) => void;
  onEditFile: (path: string) => void;
};

// The files a gate asks a person to check (each can be opened in the editor),
// and their answer. Reject needs feedback.
export function GatePanel({ files, feedback, sending, onFeedbackChange, onApprove, onReject, onEditFile }: Props) {
  return (
    <Stack spacing={2} aria-label="gate">
      {files.length === 0 && <Typography color="text.secondary">No files were changed before this gate.</Typography>}
      {files.map((file) => (
        <FileView key={file.path} {...file} onEdit={() => onEditFile(file.path)} />
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
