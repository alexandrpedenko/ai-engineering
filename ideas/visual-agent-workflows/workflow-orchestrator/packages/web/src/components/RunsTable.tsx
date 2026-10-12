import { Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import type { RunSummary } from "@orch/core";
import { formatDateTime } from "../domain/formatDateTime";
import { RunStatusChip } from "./RunStatusChip";

type Props = { runs: RunSummary[]; showWorkflow?: boolean; onOpen: (runId: string) => void };

// Runs, newest first; a row opens its run.
export function RunsTable({ runs, showWorkflow = true, onOpen }: Props) {
  if (runs.length === 0) return <Typography color="text.secondary">No runs yet.</Typography>;
  return (
    <Table size="small" aria-label="runs">
      <TableHead>
        <TableRow>
          <TableCell>Run</TableCell>
          {showWorkflow && <TableCell>Workflow</TableCell>}
          <TableCell>Status</TableCell>
          <TableCell>Started</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {runs.map((run) => (
          <TableRow key={run.runId} hover onClick={() => onOpen(run.runId)} sx={{ cursor: "pointer" }}>
            <TableCell>{run.runId}</TableCell>
            {showWorkflow && <TableCell>{run.workflowId}</TableCell>}
            <TableCell>
              <RunStatusChip status={run.busy ? "moving" : run.status} />
            </TableCell>
            <TableCell>{formatDateTime(run.startedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
