import { Button, Stack } from "@mui/material";

type Props = { onAddAgentStep: () => void; onAddGate: () => void };

// Buttons that add a new step to the canvas.
export function StepPalette({ onAddAgentStep, onAddGate }: Props) {
  return (
    <Stack spacing={1} aria-label="palette">
      <Button variant="outlined" onClick={onAddAgentStep}>
        Add agent step
      </Button>
      <Button variant="outlined" onClick={onAddGate}>
        Add gate
      </Button>
    </Stack>
  );
}
