import { Box, Chip, Paper, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { StepState, StepView } from "../domain/runView";

const marks: Record<StepState, string> = {
  pending: "○",
  running: "▸",
  done: "✓",
  failed: "✗",
  waiting: "◆",
  approved: "✓",
  rejected: "✗",
};

const labels: Record<StepState, string> = {
  pending: "not started",
  running: "running",
  done: "done",
  failed: "failed",
  waiting: "waiting for review",
  approved: "approved",
  rejected: "rejected",
};

const seconds = (ms: number) => `${Math.round(ms / 1000)} s`;

type Props = { rows: StepView[]; renderBelow?: (row: StepView) => ReactNode };

// The run's steps in order with how far each got. `renderBelow` adds content
// under a row (the live feed, the gate panel).
export function StepTimeline({ rows, renderBelow }: Props) {
  return (
    <Stack spacing={1} aria-label="steps">
      {rows.map((row) => (
        <Paper key={row.step.id} variant="outlined" sx={{ p: 1.5 }} aria-label={`step ${row.step.id}`}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography component="span" sx={{ width: 20 }}>
              {marks[row.state]}
            </Typography>
            <Typography component="span" sx={{ fontWeight: 600 }}>
              {row.step.label}
            </Typography>
            <Chip size="small" label={labels[row.state]} />
            {row.attempt > 1 && <Typography variant="body2" color="text.secondary">attempt {row.attempt}</Typography>}
            {row.record && row.state !== "running" && (
              <Typography variant="body2" color="text.secondary">
                {seconds(row.record.durationMs)}
              </Typography>
            )}
          </Stack>
          {row.record && row.state !== "running" && (
            <Box sx={{ pl: 3.5, mt: 0.5 }}>
              {row.record.status === "failed" && <Typography color="error">{row.record.summary}</Typography>}
              {row.record.writes.map((w) => (
                <Typography key={w.path} variant="body2">
                  {w.change} {w.path}
                </Typography>
              ))}
              {row.record.missing.map((path) => (
                <Typography key={path} variant="body2" color="warning.main">
                  missing {path}
                </Typography>
              ))}
            </Box>
          )}
          {row.decisions
            .filter((d) => d.decision === "reject")
            .map((d, i) => (
              <Typography key={i} variant="body2" color="text.secondary" sx={{ pl: 3.5 }}>
                rejected: {d.decision === "reject" ? d.feedback : ""}
              </Typography>
            ))}
          {renderBelow && <Box sx={{ mt: 1 }}>{renderBelow(row)}</Box>}
        </Paper>
      ))}
    </Stack>
  );
}
