import type { LoggedEvent } from "@orch/core";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { RunDetails } from "../domain/runView";
import { useOrchestratorApi } from "./orchestratorApiContext";
import { queryKeys } from "./queryKeys";

// Every event of a run, from the first, live, while the component is mounted.
// An event at or below the last seq seen (a replay) is dropped before it
// changes anything. When the run settles, its outcome is written into the
// run's cache entry and the run lists are refreshed (ADR-0011). A gate that
// starts waiting fetches its changes again.
export function useRunEvents(runId: string): LoggedEvent[] {
  const api = useOrchestratorApi();
  const client = useQueryClient();
  const [events, setEvents] = useState<LoggedEvent[]>([]);

  useEffect(() => {
    setEvents([]);
    let lastSeq = 0;
    // invalidateQueries doesn't reject (throwOnError is off), so nothing is lost by not awaiting it here.
    const refresh = (queryKey: readonly unknown[]) => void client.invalidateQueries({ queryKey });
    const stop = api.watchRun(runId, 0, (logged) => {
      if (logged.seq <= lastSeq) return;
      lastSeq = logged.seq;
      setEvents((previous) => [...previous, logged]);
      const { event } = logged;
      if (event.type === "run-settled") {
        client.setQueryData<RunDetails>(queryKeys.run(runId), (old) => (old ? { ...old, outcome: event.outcome, busy: false } : old));
        refresh(queryKeys.runLists);
      } else if (event.type === "run-crashed" || event.type === "step-finished") {
        refresh(queryKeys.run(runId));
      } else if (event.type === "gate-waiting") {
        refresh(queryKeys.gateChangesOf(runId));
      }
    });
    return stop;
  }, [api, client, runId]);

  return events;
}
