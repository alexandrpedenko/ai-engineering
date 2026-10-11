import type { GateDecision } from "@orch/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrchestratorApi } from "./orchestratorApiContext";
import { queryKeys } from "./queryKeys";

// Write hooks: each sends one action and refreshes what it changed. The run's
// own progress then arrives as events (useRunEvents).

export function useStartRun(workflowId: string) {
  const api = useOrchestratorApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (inputs: Record<string, string>) => await api.startRun(workflowId, inputs),
    onSuccess: async () => await client.invalidateQueries({ queryKey: queryKeys.runsAll }),
  });
}

function useRunAction(runId: string, send: (runId: string) => Promise<void>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => await send(runId),
    onSuccess: async () => await client.invalidateQueries({ queryKey: queryKeys.run(runId) }),
  });
}

export function useResumeRun(runId: string) {
  const api = useOrchestratorApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (decision: GateDecision) => await api.resume(runId, decision),
    onSuccess: async () => await client.invalidateQueries({ queryKey: queryKeys.run(runId) }),
  });
}

export function useContinueRun(runId: string) {
  const api = useOrchestratorApi();
  return useRunAction(runId, async (id) => await api.continueRun(id));
}

export function useCancelRun(runId: string) {
  const api = useOrchestratorApi();
  return useRunAction(runId, async (id) => await api.cancel(id));
}
