import { listRuns, runDetails } from "@orch/core";
import { Hono } from "hono";
import { readJson } from "./readJson";
import type { ServerServices } from "./ServerServices";

// Runs: list, one run, and the actions that move a run (all answer 202; the
// results arrive as events).
export function runRoutes(services: ServerServices) {
  const deps = () => ({ engine: services.engine, runFiles: services.runFiles, isBusy: (id: string) => services.supervisor.isBusy(id) });
  return new Hono()
    .get("/runs", async (c) => c.json(await listRuns(deps(), c.req.query("workflowId"))))
    .get("/runs/:runId", async (c) => c.json(await runDetails(deps(), c.req.param("runId"))))
    .post("/runs/:runId/resume", async (c) => {
      await services.supervisor.resume(c.req.param("runId"), await readJson(c));
      return c.body(null, 202);
    })
    .post("/runs/:runId/continue", async (c) => {
      await services.supervisor.continue(c.req.param("runId"));
      return c.body(null, 202);
    })
    .post("/runs/:runId/cancel", async (c) => {
      await services.supervisor.cancel(c.req.param("runId"));
      return c.body(null, 202);
    });
}
