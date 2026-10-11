import { Hono } from "hono";

// GET /health: answers as long as the process is up. Checks nothing else.
export function healthRoutes() {
  return new Hono().get("/health", (c) => c.json({ ok: true, node: process.version }));
}
