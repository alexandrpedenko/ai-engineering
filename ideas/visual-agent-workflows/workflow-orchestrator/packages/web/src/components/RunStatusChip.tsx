import { Chip } from "@mui/material";

const colors: Record<string, "default" | "info" | "success" | "error" | "warning"> = {
  moving: "info",
  starting: "info",
  waiting: "warning",
  finished: "success",
  failed: "error",
  rejected: "error",
  crashed: "error",
  interrupted: "warning",
};

const labels: Record<string, string> = { moving: "running", waiting: "waiting at gate" };

// A run's status as a coloured chip.
export function RunStatusChip({ status }: { status: string }) {
  return <Chip size="small" color={colors[status] ?? "default"} label={labels[status] ?? status} />;
}
