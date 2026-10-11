import { Alert, Box, Divider, Stack, Typography } from "@mui/material";
import type { Problem } from "@orch/core";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useDeleteWorkflow, useSaveWorkflow } from "../application/mutations";
import { usePhases, useProject, useWorkflow } from "../application/queries";
import { useLeaveWarning } from "../application/useLeaveWarning";
import { useWorkflowCheck } from "../application/useWorkflowCheck";
import { type WorkflowDraft, useWorkflowDraft } from "../application/useWorkflowDraft";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EditorToolbar } from "../components/EditorToolbar";
import { ProblemList } from "../components/ProblemList";
import { type InspectorActions, type InspectorOptions, StepInspector } from "../components/StepInspector";
import { StepPalette } from "../components/StepPalette";
import { WorkflowCanvas } from "../components/WorkflowCanvas";
import { WorkflowFields } from "../components/WorkflowFields";
import { ApiError, isNotFound } from "../domain/apiError";
import { toCanvas } from "../domain/workflowCanvas";
import {
  addInput,
  addStep,
  connect,
  disconnect,
  moveStep,
  removeInput,
  removeStep,
  renameStep,
  updateAgentStep,
  updateGate,
  updateInput,
  updateWorkflow,
} from "../domain/workflowEdits";
import { agentStepsBefore, findStep, nextStep } from "../domain/workflowGraph";

const NO_PROBLEMS: Problem[] = [];

// Removes a step and closes the inspector if it showed that step.
function removeStepAndDeselect(draft: WorkflowDraft, stepId: string) {
  draft.edit((w) => removeStep(w, stepId));
  if (draft.selectedId === stepId) draft.select(null);
}

// The inspector's callbacks for one step, each an edit of the latest draft.
function inspectorActions(draft: WorkflowDraft, stepId: string): InspectorActions {
  return {
    rename: (to) => {
      let problem: string | null = null;
      draft.edit((w) => {
        const result = renameStep(w, stepId, to);
        if (result.ok) return result.workflow;
        problem = result.problem;
        return w;
      });
      if (problem === null) draft.select(to);
      return problem;
    },
    changeAgentStep: (patch) => draft.edit((w) => updateAgentStep(w, stepId, patch)),
    changeGate: (patch) => draft.edit((w) => updateGate(w, stepId, patch)),
    setNext: (to) => draft.edit((w) => (to ? connect(w, stepId, to) : disconnect(w, stepId))),
    remove: () => removeStepAndDeselect(draft, stepId),
  };
}

// Edits one workflow on a canvas: palette and workflow fields on the left,
// the canvas with its problems in the middle, the selected step on the right.
// Edits stay in a draft until Save; problems come from the server's check.
// Mount it with `key` set to the workflow id (routes.tsx), so its own state
// (dialogs, errors) starts fresh for each workflow.
export function WorkflowEditorPage() {
  const id = useParams().id ?? "";
  const saved = useWorkflow(id);
  const project = useProject();
  const phases = usePhases();
  const draft = useWorkflowDraft(id, saved.data?.workflow);
  const check = useWorkflowCheck(draft.dirty ? (draft.workflow ?? null) : null);
  const save = useSaveWorkflow();
  const remove = useDeleteWorkflow(id);
  const navigate = useNavigate();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  useLeaveWarning(draft.dirty);

  const workflow = draft.workflow;
  const problems = (draft.dirty ? check.problems : undefined) ?? saved.data?.problems ?? NO_PROBLEMS;
  const canvas = useMemo(() => (workflow ? toCanvas(workflow, problems, draft.selectedId) : null), [workflow, problems, draft.selectedId]);

  if (saved.isPending) return <Typography>Loading…</Typography>;
  if (!workflow || !canvas) {
    const notFound = isNotFound(saved.error);
    return <Alert severity={notFound ? "info" : "error"}>{notFound ? `No workflow "${id}".` : saved.error?.message}</Alert>;
  }

  const selected = draft.selectedId ? findStep(workflow, draft.selectedId) : undefined;
  const options: InspectorOptions = {
    agents: project.data?.agents ?? [],
    skills: project.data?.skills ?? [],
    artefactPaths: (project.data?.artefacts ?? []).map((artefact) => artefact.path),
    otherStepIds: workflow.steps.map((step) => step.id).filter((stepId) => stepId !== selected?.id),
    rejectTargets: selected ? agentStepsBefore(workflow, selected.id).map((step) => step.id) : [],
  };
  const add = (type: "agent" | "gate") => {
    let added: string | null = null;
    draft.edit((w) => {
      const result = addStep(w, type);
      added = result.stepId;
      return result.workflow;
    });
    if (added) draft.select(added);
  };
  const saveDraft = () => save.mutate(workflow, { onSuccess: () => draft.markSaved(workflow) });
  const discardDraft = () => {
    save.reset();
    draft.discard();
  };
  const saveError = save.error instanceof ApiError ? save.error : null;

  return (
    <Stack spacing={2}>
      <EditorToolbar
        name={workflow.name}
        dirty={draft.dirty}
        saving={save.isPending}
        onBack={() => navigate(`/workflows/${id}`)}
        onDiscard={discardDraft}
        onDelete={() => {
          remove.reset();
          setConfirmingDelete(true);
        }}
        onSave={saveDraft}
      />
      {saved.error && <Alert severity="warning">Couldn't reload the saved workflow: {saved.error.message}. Your draft is kept.</Alert>}
      {save.error && (
        <Alert severity="error">
          Not saved: {save.error.message}
          {saveError && saveError.problems.length > 0 && <ProblemList problems={saveError.problems} />}
        </Alert>
      )}
      <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start" }}>
        <Stack spacing={2} sx={{ width: 240, flexShrink: 0 }}>
          <StepPalette onAddAgentStep={() => add("agent")} onAddGate={() => add("gate")} />
          <Divider />
          <WorkflowFields
            workflow={workflow}
            phases={phases.data ?? []}
            onChange={(patch) => draft.edit((w) => updateWorkflow(w, patch))}
            onAddInput={() => draft.edit(addInput)}
            onChangeInput={(index, patch) => draft.edit((w) => updateInput(w, index, patch))}
            onRemoveInput={(index) => draft.edit((w) => removeInput(w, index))}
          />
        </Stack>
        <Stack spacing={2} sx={{ flexGrow: 1, minWidth: 0 }}>
          <WorkflowCanvas
            canvas={canvas}
            onSelect={draft.select}
            onMove={(moved) => draft.edit((w) => moved.reduce((next, { stepId, position }) => moveStep(next, stepId, position), w))}
            onConnect={(from, to) => draft.edit((w) => connect(w, from, to))}
            onRemoveStep={(stepId) => removeStepAndDeselect(draft, stepId)}
            onDisconnect={(from) => draft.edit((w) => disconnect(w, from))}
          />
          <Stack spacing={1} aria-label="problems">
            <Typography variant="subtitle2">{check.checking ? "Problems (checking…)" : "Problems"}</Typography>
            {check.error ? (
              <Alert severity="warning">Couldn't check the draft: {check.error.message}. The problems below may be out of date.</Alert>
            ) : null}
            {problems.length === 0 ? <Typography color="text.secondary">None.</Typography> : <ProblemList problems={problems} />}
          </Stack>
        </Stack>
        <Box sx={{ width: 340, flexShrink: 0 }}>
          {selected ? (
            <StepInspector key={selected.id} step={selected} nextStepId={nextStep(workflow, selected.id)} options={options} actions={inspectorActions(draft, selected.id)} />
          ) : (
            <Typography color="text.secondary">Select a step on the canvas to edit it.</Typography>
          )}
        </Box>
      </Stack>
      <ConfirmDialog
        open={confirmingDelete}
        title={`Delete "${workflow.name}"?`}
        text={`This deletes ${id}.json from the project. Its past runs stay in the runs list.`}
        confirmLabel="Delete"
        busy={remove.isPending}
        error={remove.error?.message ?? null}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              draft.forget();
              navigate("/project");
            },
          })
        }
      />
    </Stack>
  );
}
