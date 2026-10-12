import { useQuery } from "@tanstack/react-query";
import { toServerStatus, type ServerStatus } from "../domain/serverStatus";
import { useOrchestratorApi } from "./orchestratorApiContext";
import { queryKeys } from "./queryKeys";

// Asks the server once whether it is up and which agent runtime it uses. Does
// not poll and does not retry.
export function useServerStatus(): { status: ServerStatus; runtime?: string } {
  const api = useOrchestratorApi();
  const health = useQuery({
    queryKey: queryKeys.health,
    queryFn: async () => await api.health(),
    retry: false,
  });
  const status = toServerStatus({ isPending: health.isPending, isError: health.isError, ...(health.data ? { up: health.data.up } : {}) });
  return health.data?.runtime ? { status, runtime: health.data.runtime } : { status };
}
