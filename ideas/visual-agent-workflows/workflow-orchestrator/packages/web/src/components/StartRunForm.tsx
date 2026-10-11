import { Button, Paper, Stack, TextField, Typography } from "@mui/material";
import type { WorkflowInput } from "@orch/core";
import { useState } from "react";

type Props = {
  inputs: WorkflowInput[];
  disabledReason?: string; // shown instead of starting, e.g. "fix the errors first"
  submitting: boolean;
  error?: string;
  onStart: (values: Record<string, string>) => void;
};

// The workflow's inputs and a Start button.
export function StartRunForm({ inputs, disabledReason, submitting, error, onStart }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const missing = inputs.some((input) => input.required && !values[input.id]?.trim());

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack
        spacing={2}
        component="form"
        aria-label="start a run"
        onSubmit={(event) => {
          event.preventDefault();
          onStart(values);
        }}
      >
        <Typography variant="subtitle1">Start a run</Typography>
        {inputs.map((input) => (
          <TextField
            key={input.id}
            label={input.label}
            required={input.required}
            value={values[input.id] ?? ""}
            onChange={(event) => setValues({ ...values, [input.id]: event.target.value })}
            size="small"
          />
        ))}
        {disabledReason && <Typography color="error">{disabledReason}</Typography>}
        {error && <Typography color="error">{error}</Typography>}
        <Button type="submit" variant="contained" disabled={Boolean(disabledReason) || missing || submitting}>
          {submitting ? "Starting…" : "Start run"}
        </Button>
      </Stack>
    </Paper>
  );
}
