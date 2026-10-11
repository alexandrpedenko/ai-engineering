import { InvalidInputError, listWorkflows, readWorkflow, saveWorkflow } from "@orch/core";
import { Hono } from "hono";
import { z } from "zod";
import { readJson } from "./readJson";
import type { ServerServices } from "./ServerServices";

const StartBody = z.object({ inputs: z.record(z.string(), z.string()).default({}) });

// Workflow files: list, read, save, delete; and starting a run of one.
export function workflowRoutes(services: ServerServices) {
  const deps = async () => ({ store: services.store, registry: await services.scan() });
  return new Hono()
    .get("/workflows", async (c) => c.json(await listWorkflows(await deps())))
    .get("/workflows/:id", async (c) => c.json(await readWorkflow(await deps(), c.req.param("id"))))
    .put("/workflows/:id", async (c) => c.json({ problems: await saveWorkflow(await deps(), c.req.param("id"), await readJson(c)) }))
    .delete("/workflows/:id", async (c) => {
      await services.store.remove(c.req.param("id"));
      return c.body(null, 204);
    })
    .post("/workflows/:id/runs", async (c) => {
      const body = StartBody.safeParse(await readJson(c));
      if (!body.success) throw new InvalidInputError("the body must be { inputs: { [id]: string } }");
      return c.json(await services.supervisor.start(c.req.param("id"), body.data.inputs), 202);
    });
}
