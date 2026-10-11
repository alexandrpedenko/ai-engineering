import { savePhases } from "@orch/core";
import { Hono } from "hono";
import { readJson } from "./readJson";
import type { ServerServices } from "./ServerServices";

// The project's phases (the defaults when it has no phases.json).
export function phaseRoutes(services: ServerServices) {
  return new Hono()
    .get("/phases", async (c) => c.json({ phases: await services.store.phases() }))
    .put("/phases", async (c) => {
      await savePhases(services.store, await readJson(c));
      return c.body(null, 204);
    });
}
