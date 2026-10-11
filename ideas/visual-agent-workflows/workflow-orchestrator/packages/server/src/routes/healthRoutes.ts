import { Hono } from "hono";

// GET /health: answers as long as the process is up, with the agent runtime
// in use. Checks nothing else.
export function healthRoutes(info: { runtime: string }) {
  return new Hono().get("/health", (c) => c.json({ ok: true, node: process.version, runtime: info.runtime }));
}
