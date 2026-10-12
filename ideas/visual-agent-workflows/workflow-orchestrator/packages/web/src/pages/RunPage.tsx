import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useCancelRun, useContinueRun, useDeleteRun, useResumeRun, useRetryRun } from "../application/mutations";
import { useFiles, useGateChanges, useRun } from "../application/queries";
import { useGateDraftStore } from "../application/useGateDraftStore";
import { useRunEvents } from "../application/useRunEvents";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EventFeed } from "../components/EventFeed";
import { GatePanel } from "../components/GatePanel";
import { RunStatusChip } from "../components/RunStatusChip";
import { StepTimeline } from "../components/StepTimeline";
import { isNotFound } from "../domain/apiError";
import { eventLine } from "../domain/eventLine";
import { type FileText, gateFileViews } from "../domain/gateFileViews";
import { runHeadline, stepTimeline } from "../domain/runView";

// One run, live: its steps, what the agent is doing, the gate when it waits.
export function RunPage() {
  const runId = useParams().runId ?? "";
  const navigate = useNavigate();
  const run = useRun(runId);
  const events = useRunEvents(runId);
  const resume = useResumeRun(runId);
  const continueRun = useContinueRun(runId);
  const cancel = useCancelRun(runId);
  const retry = useRetryRun(runId);
  const remove = useDeleteRun(runId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const draft = useGateDraftStore((state) => state.drafts[runId] ?? "");
  const setDraft = useGateDraftStore((state) => state.setDraft);
  const clearDraft = useGateDraftStore((state) => state.clearDraft);

  const rows = run.data ? stepTimeline(run.data, events) : [];
  const waitingRow = rows.find((row) => row.state === "waiting");
  const waitingGate = waitingRow?.step.type === "gate" ? waitingRow.step : undefined;
  const changes = useGateChanges(runId, waitingGate?.id);
  const readable = (changes.data ?? []).filter((file) => file.change !== "deleted").map((file) => file.path);
  const texts = useFiles(readable);

  if (run.isPending) return <Typography>Loading…</Typography>;
  if (run.error) {
    return <Alert severity={isNotFound(run.error) ? "info" : "error"}>{isNotFound(run.error) ? `No run "${runId}".` : run.error.message}</Alert>;
  }

  const headline = runHeadline(run.data, events);
  const lines = events.map(eventLine).filter((line) => line !== null);
  const sending = resume.isPending;
  const actionError = resume.error ?? continueRun.error ?? retry.error ?? cancel.error;
  // The whole text of a gate's file, as far as it has loaded.
  const textOf = (path: string): FileText | undefined => {
    const text = texts[readable.indexOf(path)];
    if (!text) return undefined;
    if (text.isPending) return { loading: true };
    if (text.error) return { error: isNotFound(text.error) ? "File not found." : text.error.message };
    return { content: text.data.content };
  };
  const serverStatus = run.data.outcome?.status;
  const continueButton = (
    <Button color="inherit" size="small" disabled={continueRun.isPending} onClick={() => continueRun.mutate()}>
      Continue
    </Button>
  );
  const retryButton = (
    <Button color="inherit" size="small" disabled={retry.isPending} onClick={() => retry.mutate()}>
      Retry
    </Button>
  );

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <Typography variant="h5">{run.data.workflow.name}</Typography>
        <RunStatusChip status={headline.status} />
        <Typography color="text.secondary">{runId}</Typography>
        {headline.status !== "moving" && (
          <Button size="small" color="error" sx={{ ml: "auto" }} onClick={() => setConfirmingDelete(true)}>
            Delete run
          </Button>
        )}
      </Stack>

      {headline.status === "finished" && <Alert severity="success">Finished.</Alert>}
      {headline.status === "failed" && (
        <Alert severity="error" action={retryButton}>
          Failed at {headline.stepId}: {run.data.outcome?.state.steps[headline.stepId ?? ""]?.summary}
        </Alert>
      )}
      {headline.status === "rejected" && <Alert severity="error">Rejected at {headline.gateId}: no revisions left.</Alert>}
      {headline.status === "crashed" && (
        <Alert
          severity="error"
          action={serverStatus === "interrupted" ? continueButton : serverStatus === "failed" ? retryButton : undefined}
        >
          The run stopped with an error: {headline.message}
        </Alert>
      )}
      {headline.status === "interrupted" && (
        <Alert severity="warning" action={continueButton}>
          Stopped inside {headline.stepId} (the server stopped while it ran).
        </Alert>
      )}
      {actionError && <Alert severity="error">{actionError.message}</Alert>}

      <StepTimeline
        rows={rows}
        renderBelow={(row) => {
          if (row.state === "running") {
            return (
              <Stack spacing={1}>
                <EventFeed lines={lines.filter((line) => line.stepId === row.step.id)} />
                <Box>
                  <Button size="small" color="warning" variant="outlined" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                    Cancel this step
                  </Button>
                </Box>
              </Stack>
            );
          }
          if (row.state === "waiting" && waitingGate) {
            return (
              <GatePanel
                files={changes.data ? gateFileViews(changes.data, textOf) : undefined}
                {...(changes.error ? { error: `Couldn't load the changes: ${changes.error.message}` } : {})}
                feedback={draft}
                sending={sending}
                onFeedbackChange={(text) => setDraft(runId, text)}
                onApprove={() => resume.mutate({ decision: "approve" }, { onSuccess: () => clearDraft(runId) })}
                onReject={(feedback) => resume.mutate({ decision: "reject", feedback }, { onSuccess: () => clearDraft(runId) })}
                onEditFile={(path) => navigate(`/files?path=${encodeURIComponent(path)}`)}
              />
            );
          }
          return null;
        }}
      />
      <ConfirmDialog
        open={confirmingDelete}
        title={`Delete run ${runId}?`}
        text="This forgets the run: its steps, events and the recorded project states its gates compare with. Files the agents wrote stay in the project."
        confirmLabel="Delete"
        busy={remove.isPending}
        error={remove.error?.message ?? null}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => remove.mutate(undefined, { onSuccess: () => navigate("/runs") })}
      />
    </Stack>
  );
}
