import { checkWorkflow, createWorkflow, InvalidInputError, listWorkflows, readWorkflow, saveWorkflow } from "@orch/core";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { readJson } from "./readJson";
import type { ServerServices } from "./ServerServices";

const StartBody = z.object({ inputs: z.record(z.string(), z.string()).default({}) });
const WorkflowBody = z.object({ workflow: z.unknown() });

// The `workflow` field of a { workflow } body; the use case checks its shape.
async function workflowField(c: Context): Promise<unknown> {
  const body = WorkflowBody.safeParse(await readJson(c));
  if (!body.success) throw new InvalidInputError("the body must be { workflow }");
  return body.data.workflow;
}

// Workflow files: list, read, create, check, save, delete; and starting a run of one.
export function workflowRoutes(services: ServerServices) {
  const deps = async () => ({ store: services.store, registry: await services.scan() });
  return new Hono()
    .get("/workflows", async (c) => c.json(await listWorkflows(await deps())))
    .post("/workflows", async (c) => c.json({ problems: await createWorkflow(await deps(), await workflowField(c)) }, 201))
    .post("/workflows/check", async (c) => c.json({ problems: await checkWorkflow(await deps(), await workflowField(c)) }))
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
