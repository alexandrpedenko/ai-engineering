import { Alert, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router";
import { useRuns } from "../application/queries";
import { RunsTable } from "../components/RunsTable";

// Every run, newest first.
export function RunsPage() {
  const runs = useRuns();
  const navigate = useNavigate();
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Runs</Typography>
      {runs.isPending && <Typography>Loading…</Typography>}
      {runs.error && <Alert severity="error">{runs.error.message}</Alert>}
      {runs.data && <RunsTable runs={runs.data} onOpen={(runId) => navigate(`/runs/${runId}`)} />}
    </Stack>
  );
}
