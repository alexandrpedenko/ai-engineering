import { Hono } from "hono";
import type { ServerServices } from "./ServerServices";

// GET /health: answers while the process is up, with the agent runtime, the
// orchestrator version, and whether git is found, the data folder can be
// written and the runtime's API key is set.
export function healthRoutes(services: Pick<ServerServices, "runtimeName" | "health">) {
  return new Hono().get("/health", async (c) => c.json({ ok: true, node: process.version, runtime: services.runtimeName, ...(await services.health()) }));
}
