import { Chip } from "@mui/material";
import type { ServerStatus } from "../domain/serverStatus";

const colors = { checking: "default", up: "success", down: "error" } as const;

// Whether the server is up, and which agent runtime runs the steps.
export function ServerStatusChip({ status, runtime }: { status: ServerStatus; runtime?: string }) {
  const label = runtime && status === "up" ? `server: up · runtime: ${runtime}` : `server: ${status}`;
  return <Chip size="small" label={label} color={colors[status]} />;
}
