import type { GateDecision, Workflow } from "@orch/core";
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

export function useRetryRun(runId: string) {
  const api = useOrchestratorApi();
  return useRunAction(runId, async (id) => await api.retry(id));
}

export function useCancelRun(runId: string) {
  const api = useOrchestratorApi();
  return useRunAction(runId, async (id) => await api.cancel(id));
}

// Creates a workflow file. The workflow list and every workflow query go stale.
export function useCreateWorkflow() {
  const api = useOrchestratorApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (workflow: Workflow) => await api.createWorkflow(workflow),
    onSuccess: async () => await client.invalidateQueries({ queryKey: queryKeys.workflows }),
  });
}

// Saves a workflow over its file. The list and this workflow are refetched
// before the returned promise settles, so a page shows the saved version next.
export function useSaveWorkflow() {
  const api = useOrchestratorApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (workflow: Workflow) => await api.saveWorkflow(workflow),
    onSuccess: async () => await client.invalidateQueries({ queryKey: queryKeys.workflows }),
  });
}

// Deletes a workflow file. Its own query is dropped (not refetched into a 404)
// and the list goes stale.
export function useDeleteWorkflow(id: string) {
  const api = useOrchestratorApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => await api.deleteWorkflow(id),
    onSuccess: async () => {
      client.removeQueries({ queryKey: queryKeys.workflow(id), exact: true });
      await client.invalidateQueries({ queryKey: queryKeys.workflows, exact: true });
    },
  });
}

// Saves a project file, sending the version it was loaded at unless told to
// overwrite. On success the file's cache holds the saved text and version,
// and the project's registry goes stale (a skill or agent may have changed).
export function useSaveFile(path: string) {
  const api = useOrchestratorApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ content, baseVersion }: { content: string; baseVersion?: string }) => ({
      content,
      ...(await api.saveFile(path, content, baseVersion)),
    }),
    onSuccess: async ({ content, version }) => {
      client.setQueryData(queryKeys.file(path), { path, content, version });
      await client.invalidateQueries({ queryKey: queryKeys.project });
    },
  });
}
