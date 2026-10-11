import { Chip } from "@mui/material";
import type { ServerStatus } from "../domain/serverStatus";

const colors = { checking: "default", up: "success", down: "error" } as const;

export function ServerStatusChip({ status }: { status: ServerStatus }) {
  return <Chip size="small" label={`server: ${status}`} color={colors[status]} />;
}
