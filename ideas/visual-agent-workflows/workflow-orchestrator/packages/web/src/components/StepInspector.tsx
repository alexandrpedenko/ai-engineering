import { Accordion, AccordionDetails, AccordionSummary, Autocomplete, Button, Chip, MenuItem, Stack, TextField, Typography } from "@mui/material";
import type { AgentStep, GateStep, Step } from "@orch/core";
import { useState } from "react";
import type { AgentStepFields, GateStepFields } from "../domain/workflowEdits";

export type Named = { name: string; description: string };

export type InspectorOptions = {
  agents: Named[];
  skills: Named[];
  artefactPaths: string[]; // suggestions for reads, writes and shows
  otherStepIds: string[]; // choices for "next step"
  rejectTargets: string[]; // agent steps before this gate (the server's check reports a wrong one)
};

export type InspectorActions = {
  rename: (to: string) => string | null; // the reason it was refused, or null
  changeAgentStep: (patch: Partial<AgentStepFields>) => void;
  changeGate: (patch: Partial<GateStepFields>) => void;
  setNext: (to: string | null) => void;
  remove: () => void;
};

type Props = { step: Step; nextStepId: string | null; options: InspectorOptions; actions: InspectorActions };

// `values` first, then the rest of `known` in order: a picker always offers
// the current value, even one the project doesn't have.
function withCurrent(known: string[], values: string[]): string[] {
  return [...new Set([...values.filter((v) => v !== ""), ...known])];
}

function PathList({ label, value, suggestions, onChange }: { label: string; value: string[]; suggestions: string[]; onChange: (paths: string[]) => void }) {
  return (
    <Autocomplete
      multiple
      freeSolo
      size="small"
      options={suggestions}
      value={value}
      onChange={(_, paths) => onChange(paths)}
      renderValue={(paths, getItemProps) => paths.map((path, index) => <Chip size="small" label={path} {...getItemProps({ index })} key={path} />)}
      renderInput={(params) => <TextField {...params} label={label} placeholder="path or glob, then Enter" />}
    />
  );
}

function StepIdField({ id, rename }: { id: string; rename: InspectorActions["rename"] }) {
  const [text, setText] = useState(id);
  const [problem, setProblem] = useState<string | null>(null);
  const commit = () => {
    const wanted = text.trim();
    setProblem(wanted === id ? null : rename(wanted));
  };
  return (
    <TextField
      size="small"
      label="Id"
      value={text}
      error={problem !== null}
      helperText={problem ?? "used in edges and run records"}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
    />
  );
}

function AgentFields({ step, options, change }: { step: AgentStep; options: InspectorOptions; change: InspectorActions["changeAgentStep"] }) {
  const agentNames = withCurrent(options.agents.map((a) => a.name), [step.agent]);
  const skillNames = withCurrent(options.skills.map((s) => s.name), step.skills);
  const describe = (list: Named[], name: string) => list.find((item) => item.name === name)?.description ?? "not in this project";
  return (
    <>
      <TextField select size="small" label="Agent" value={step.agent} onChange={(event) => change({ agent: event.target.value })}>
        <MenuItem value="">
          <em>choose an agent</em>
        </MenuItem>
        {agentNames.map((name) => (
          <MenuItem key={name} value={name}>
            <Stack>
              <span>{name}</span>
              <Typography variant="caption" color="text.secondary">
                {describe(options.agents, name)}
              </Typography>
            </Stack>
          </MenuItem>
        ))}
      </TextField>
      <Autocomplete
        multiple
        size="small"
        options={skillNames}
        value={step.skills}
        onChange={(_, skills) => change({ skills })}
        getOptionLabel={(name) => name}
        renderOption={({ key, ...props }, name) => (
          <li key={key} {...props}>
            <Stack>
              <span>{name}</span>
              <Typography variant="caption" color="text.secondary">
                {describe(options.skills, name)}
              </Typography>
            </Stack>
          </li>
        )}
        renderInput={(params) => <TextField {...params} label="Skills" />}
      />
      <TextField
        size="small"
        label="Instructions"
        multiline
        minRows={4}
        value={step.instructions}
        helperText="{{inputs.<id>}} is replaced by a run input"
        onChange={(event) => change({ instructions: event.target.value })}
      />
      <TextField
        size="small"
        label="Model (optional)"
        value={step.model ?? ""}
        onChange={(event) => change({ model: event.target.value || null })}
        onBlur={(event) => change({ model: event.target.value.trim() || null })}
      />
      <Accordion disableGutters variant="outlined">
        <AccordionSummary>Files (optional)</AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <Typography variant="caption" color="text.secondary">
              Empty is fine: the agent writes where its skills say, and every change is recorded.
            </Typography>
            <PathList label="Reads" value={step.reads} suggestions={options.artefactPaths} onChange={(reads) => change({ reads })} />
            <PathList label="Writes" value={step.writes} suggestions={options.artefactPaths} onChange={(writes) => change({ writes })} />
          </Stack>
        </AccordionDetails>
      </Accordion>
    </>
  );
}

// A whole number of at least 0, typed freely and kept only once it is one.
function MaxRevisionsField({ value, change }: { value: number; change: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  return (
    <TextField
      size="small"
      type="number"
      label="Max revisions"
      value={text}
      slotProps={{ htmlInput: { min: 0 } }}
      onChange={(event) => {
        setText(event.target.value);
        const n = Number(event.target.value);
        if (event.target.value.trim() !== "" && Number.isInteger(n) && n >= 0) change(n);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

function GateFields({ step, options, change }: { step: GateStep; options: InspectorOptions; change: InspectorActions["changeGate"] }) {
  const targets = withCurrent(options.rejectTargets, [step.onReject]);
  return (
    <>
      <TextField select size="small" label="Sends rejections to" value={step.onReject} onChange={(event) => change({ onReject: event.target.value })}>
        {targets.map((id) => (
          <MenuItem key={id} value={id}>
            {id}
          </MenuItem>
        ))}
      </TextField>
      <MaxRevisionsField value={step.maxRevisions} change={(maxRevisions) => change({ maxRevisions })} />
      <Accordion disableGutters variant="outlined">
        <AccordionSummary>Files to show (optional)</AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <Typography variant="caption" color="text.secondary">
              Empty shows the files the steps before this gate changed.
            </Typography>
            <PathList label="Shows" value={step.shows} suggestions={options.artefactPaths} onChange={(shows) => change({ shows })} />
          </Stack>
        </AccordionDetails>
      </Accordion>
    </>
  );
}

// The fields of the selected step. Give it `key={step.id}` so the id field
// starts again from a renamed step's new id.
export function StepInspector({ step, nextStepId, options, actions }: Props) {
  return (
    <Stack spacing={2} aria-label="inspector">
      <Typography variant="subtitle1">{step.type === "agent" ? "Agent step" : "Gate"}</Typography>
      <StepIdField id={step.id} rename={actions.rename} />
      <TextField
        size="small"
        label="Label"
        value={step.label}
        onChange={(event) => (step.type === "agent" ? actions.changeAgentStep({ label: event.target.value }) : actions.changeGate({ label: event.target.value }))}
      />
      {step.type === "agent" ? (
        <AgentFields step={step} options={options} change={actions.changeAgentStep} />
      ) : (
        <GateFields step={step} options={options} change={actions.changeGate} />
      )}
      <TextField select size="small" label="Next step" value={nextStepId ?? ""} onChange={(event) => actions.setNext(event.target.value || null)}>
        <MenuItem value="">
          <em>none (last step)</em>
        </MenuItem>
        {options.otherStepIds.map((id) => (
          <MenuItem key={id} value={id}>
            {id}
          </MenuItem>
        ))}
      </TextField>
      <Button color="error" variant="outlined" onClick={actions.remove}>
        Remove step
      </Button>
    </Stack>
  );
}
