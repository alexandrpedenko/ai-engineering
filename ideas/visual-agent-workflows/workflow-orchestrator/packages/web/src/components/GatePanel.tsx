import { Button, Stack, TextField } from "@mui/material";
import { FileView } from "./FileView";

export type GateFile = { path: string; content?: string; error?: string; loading?: boolean };

type Props = {
  files: GateFile[];
  feedback: string;
  sending: boolean;
  onFeedbackChange: (text: string) => void;
  onApprove: () => void;
  onReject: (feedback: string) => void;
};

// The files a gate asks a person to check, and their answer. Reject needs feedback.
export function GatePanel({ files, feedback, sending, onFeedbackChange, onApprove, onReject }: Props) {
  return (
    <Stack spacing={2} aria-label="gate">
      {files.map((file) => (
        <FileView key={file.path} {...file} />
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
