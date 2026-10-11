import type { Problem, Workflow } from "@orch/core";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useOrchestratorApi } from "./orchestratorApiContext";
import { queryKeys } from "./queryKeys";

// `value` once it has stopped changing for `delayMs`.
function useSettled<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

export type WorkflowCheck = {
  problems: Problem[] | undefined; // undefined until the first answer, and while there is no draft
  checking: boolean; // the draft changed since the last answer, or a request is on its way
  error: Error | null; // the last check failed; `problems` may be out of date
};

// The server's problems with a draft, asked for once the draft has stopped
// changing for `delayMs`. Keeps the last answer while a newer one is on its
// way. Asks nothing while `draft` is null. Answers are dropped from the cache
// as soon as nothing shows them.
export function useWorkflowCheck(draft: Workflow | null, delayMs = 400): WorkflowCheck {
  const api = useOrchestratorApi();
  const settled = useSettled(draft, delayMs);
  const query = useQuery({
    queryKey: queryKeys.workflowCheck(settled),
    queryFn: async () => (settled ? await api.checkWorkflow(settled) : []),
    enabled: settled !== null,
    placeholderData: keepPreviousData,
    gcTime: 0,
    retry: false,
  });
  if (draft === null) return { problems: undefined, checking: false, error: null };
  return { problems: query.data, checking: draft !== settled || query.isFetching, error: query.error };
}
