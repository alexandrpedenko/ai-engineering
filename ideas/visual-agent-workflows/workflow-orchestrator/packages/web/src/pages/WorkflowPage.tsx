import { Alert, Button, Grid, Stack, Typography } from "@mui/material";
import { useNavigate, useParams } from "react-router";
import { useStartRun } from "../application/mutations";
import { usePhases, useRuns, useWorkflow } from "../application/queries";
import { ProblemList } from "../components/ProblemList";
import { RunsTable } from "../components/RunsTable";
import { StartRunForm } from "../components/StartRunForm";
import { StepList } from "../components/StepList";
import { isNotFound } from "../domain/apiError";
import { problemCounts } from "../domain/problemCounts";

// One workflow: its steps and problems, a form to start it, its runs.
export function WorkflowPage() {
  const id = useParams().id ?? "";
  const workflow = useWorkflow(id);
  const phases = usePhases();
  const runs = useRuns(id);
  const start = useStartRun(id);
  const navigate = useNavigate();

  if (workflow.isPending) return <Typography>Loading…</Typography>;
  if (workflow.error) {
    return <Alert severity={isNotFound(workflow.error) ? "info" : "error"}>{isNotFound(workflow.error) ? `No workflow "${id}".` : workflow.error.message}</Alert>;
  }

  const { workflow: wf, problems } = workflow.data;
  const phase = phases.data?.find((p) => p.id === wf.phase)?.name ?? "Unsorted";
  const { errors } = problemCounts(problems);

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ alignItems: "flex-start", justifyContent: "space-between" }}>
        <Stack spacing={0.5}>
          <Typography variant="h5">{wf.name}</Typography>
          <Typography color="text.secondary">phase: {phase}</Typography>
        </Stack>
        <Button variant="outlined" onClick={() => navigate(`/workflows/${id}/edit`)}>
          Edit
        </Button>
      </Stack>
      <ProblemList problems={problems} />
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Typography variant="subtitle1">Steps</Typography>
          <StepList workflow={wf} />
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <StartRunForm
            inputs={wf.inputs}
            submitting={start.isPending}
            {...(errors > 0 ? { disabledReason: "Fix the errors above before running this workflow." } : {})}
            {...(start.error ? { error: start.error.message } : {})}
            onStart={(values) => start.mutate(values, { onSuccess: ({ runId }) => navigate(`/runs/${runId}`) })}
          />
        </Grid>
      </Grid>
      <Stack spacing={1}>
        <Typography variant="subtitle1">Runs</Typography>
        <RunsTable runs={runs.data ?? []} showWorkflow={false} onOpen={(runId) => navigate(`/runs/${runId}`)} />
      </Stack>
    </Stack>
  );
}
