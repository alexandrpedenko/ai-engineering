import { useQuery } from "@tanstack/react-query";
import { toServerStatus, type ServerStatus } from "../domain/serverStatus";
import { useOrchestratorApi } from "./orchestratorApiContext";
import { queryKeys } from "./queryKeys";

// Asks the server once whether it is up. Does not poll and does not retry.
export function useServerStatus(): ServerStatus {
  const api = useOrchestratorApi();
  const health = useQuery({
    queryKey: queryKeys.health,
    queryFn: async () => await api.isServerUp(),
    retry: false,
  });
  return toServerStatus({ isPending: health.isPending, isError: health.isError, up: health.data });
}
