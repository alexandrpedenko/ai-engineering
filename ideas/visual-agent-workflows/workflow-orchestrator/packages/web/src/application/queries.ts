import { useQueries, useQuery } from "@tanstack/react-query";
import { useOrchestratorApi } from "./orchestratorApiContext";
import { queryKeys } from "./queryKeys";

// Read hooks: one per server resource. Each returns TanStack Query's result
// (data, isPending, error).

export function useProject() {
  const api = useOrchestratorApi();
  return useQuery({ queryKey: queryKeys.project, queryFn: async () => await api.project() });
}

export function usePhases() {
  const api = useOrchestratorApi();
  return useQuery({ queryKey: queryKeys.phases, queryFn: async () => await api.phases() });
}

export function useWorkflows() {
  const api = useOrchestratorApi();
  return useQuery({ queryKey: queryKeys.workflows, queryFn: async () => await api.workflows() });
}

export function useWorkflow(id: string) {
  const api = useOrchestratorApi();
  return useQuery({ queryKey: queryKeys.workflow(id), queryFn: async () => await api.workflow(id) });
}

export function useRuns(workflowId?: string) {
  const api = useOrchestratorApi();
  return useQuery({ queryKey: queryKeys.runs(workflowId), queryFn: async () => await api.runs(workflowId) });
}

export function useRun(runId: string) {
  const api = useOrchestratorApi();
  return useQuery({ queryKey: queryKeys.run(runId), queryFn: async () => await api.run(runId), retry: false });
}

// What the steps before a gate changed, while `gateId` is set. Not cached
// for long: a new attempt changes the files again.
export function useGateChanges(runId: string, gateId: string | undefined) {
  const api = useOrchestratorApi();
  return useQuery({
    queryKey: queryKeys.gateChanges(runId, gateId ?? ""),
    queryFn: async () => await api.gateChanges(runId, gateId ?? ""),
    enabled: gateId !== undefined,
    retry: false,
    staleTime: 0,
  });
}

// One project file, for editing. Not refetched while the editor is open: a
// newer version on disk is found when saving.
export function useFile(path: string) {
  const api = useOrchestratorApi();
  return useQuery({ queryKey: queryKeys.file(path), queryFn: async () => await api.file(path), retry: false, staleTime: Infinity });
}

// Several project files at once (a gate's files). Not cached for long: the
// agent may rewrite them on the next attempt.
export function useFiles(paths: string[]) {
  const api = useOrchestratorApi();
  return useQueries({
    queries: paths.map((path) => ({
      queryKey: queryKeys.file(path),
      queryFn: async () => await api.file(path),
      retry: false,
      staleTime: 0,
    })),
  });
}
