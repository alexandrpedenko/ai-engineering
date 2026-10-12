import type { LoggedEvent } from "@orch/core";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { RunDetails } from "../domain/runView";
import { useOrchestratorApi } from "./orchestratorApiContext";
import { queryKeys } from "./queryKeys";

// Every event of a run, from the first, live, while the component is mounted.
// When the run settles, its outcome is written into the run's cache entry and
// the run lists are refreshed (ADR-0011). A gate that starts waiting fetches
// its changes again.
export function useRunEvents(runId: string): LoggedEvent[] {
  const api = useOrchestratorApi();
  const client = useQueryClient();
  const [events, setEvents] = useState<LoggedEvent[]>([]);

  useEffect(() => {
    setEvents([]);
    const refresh = async (queryKey: readonly unknown[]) => await client.invalidateQueries({ queryKey });
    const stop = api.watchRun(runId, 0, (logged) => {
      setEvents((previous) => (previous.some((e) => e.seq === logged.seq) ? previous : [...previous, logged]));
      const { event } = logged;
      if (event.type === "run-settled") {
        client.setQueryData<RunDetails>(queryKeys.run(runId), (old) => (old ? { ...old, outcome: event.outcome, busy: false } : old));
        void refresh(queryKeys.runsAll);
      } else if (event.type === "run-crashed" || event.type === "step-finished") {
        void refresh(queryKeys.run(runId));
      } else if (event.type === "gate-waiting") {
        void refresh(queryKeys.gateChangesOf(runId));
      }
    });
    return stop;
  }, [api, client, runId]);

  return events;
}
