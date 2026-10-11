// Whether the orchestrator server answered its health check.
export type ServerStatus = "checking" | "up" | "down";

// The status shown for a health check that is still running, failed with an
// error, or answered with `up`.
export function toServerStatus(check: { isPending: boolean; isError: boolean; up?: boolean }): ServerStatus {
  if (check.isPending) return "checking";
  if (check.isError) return "down";
  return check.up ? "up" : "down";
}
