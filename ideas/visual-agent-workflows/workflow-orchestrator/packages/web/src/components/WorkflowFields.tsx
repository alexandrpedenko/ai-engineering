import { Button, Checkbox, FormControlLabel, IconButton, MenuItem, Stack, TextField, Typography } from "@mui/material";
import type { Phase, Workflow, WorkflowInput } from "@orch/core";
import type { WorkflowFieldsPatch } from "../domain/workflowEdits";

type Props = {
  workflow: Workflow;
  phases: Phase[];
  onChange: (patch: WorkflowFieldsPatch) => void;
  onAddInput: () => void;
  onChangeInput: (index: number, patch: Partial<Omit<WorkflowInput, "type">>) => void;
  onRemoveInput: (index: number) => void;
};

// The workflow's own fields: name, phase, and the inputs a run asks for.
export function WorkflowFields({ workflow, phases, onChange, onAddInput, onChangeInput, onRemoveInput }: Props) {
  const knownPhase = phases.some((phase) => phase.id === workflow.phase);
  return (
    <Stack spacing={2} aria-label="workflow fields">
      <Typography variant="subtitle2">Workflow</Typography>
      <TextField size="small" label="Name" value={workflow.name} onChange={(event) => onChange({ name: event.target.value })} />
      <TextField select size="small" label="Phase" value={workflow.phase ?? ""} onChange={(event) => onChange({ phase: event.target.value || null })}>
        <MenuItem value="">
          <em>none (Unsorted)</em>
        </MenuItem>
        {!knownPhase && workflow.phase && <MenuItem value={workflow.phase}>{workflow.phase} (not in phases.json)</MenuItem>}
        {phases.map((phase) => (
          <MenuItem key={phase.id} value={phase.id}>
            {phase.name}
          </MenuItem>
        ))}
      </TextField>
      <Typography variant="subtitle2">Inputs</Typography>
      {workflow.inputs.map((input, index) => (
        <Stack key={index} spacing={1} role="group" aria-label={`input ${index + 1}`}>
          <TextField size="small" label="Input id" value={input.id} onChange={(event) => onChangeInput(index, { id: event.target.value })} />
          <TextField size="small" label="Question" value={input.label} onChange={(event) => onChangeInput(index, { label: event.target.value })} />
          <Stack direction="row" sx={{ justifyContent: "space-between" }}>
            <FormControlLabel
              control={<Checkbox size="small" checked={input.required} onChange={(event) => onChangeInput(index, { required: event.target.checked })} />}
              label="Required"
            />
            <IconButton aria-label={`remove input ${input.id}`} onClick={() => onRemoveInput(index)}>
              ×
            </IconButton>
          </Stack>
        </Stack>
      ))}
      <Button size="small" onClick={onAddInput}>
        Add input
      </Button>
    </Stack>
  );
}
