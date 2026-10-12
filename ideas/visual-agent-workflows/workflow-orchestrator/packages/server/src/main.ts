import { join, relative } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { InvalidConfigError } from "@orch/core";
import { formatConfigError } from "./cli/formatConfigError";
import { createApp, createServerServices, describeSetup, orchestratorDir } from "./composition";

const port = Number(process.env.ORCH_PORT ?? 4317);
const projectRoot = process.env.ORCH_PROJECT_ROOT;
const fake = process.env.ORCH_FAKE === "1";
// How long a shutdown waits for moving runs to stop before exiting anyway.
const SHUTDOWN_GRACE_MS = 10_000;

let services: Awaited<ReturnType<typeof createServerServices>>;
try {
  services = await createServerServices({ ...(projectRoot ? { projectRoot } : {}), fake });
} catch (error) {
  if (!(error instanceof InvalidConfigError)) throw error;
  process.stderr.write(formatConfigError(error));
  process.exit(1);
}
const { logger } = services;

// With ORCH_SERVE_WEB=1 (npm start), the built web app is served from this
// port too; any path outside /api gets index.html, so the app's routes work.
const app = createApp(services, (error) => logger.error("request failed", error));
if (process.env.ORCH_SERVE_WEB === "1") {
  // serveStatic takes a root relative to the working directory.
  const root = relative(process.cwd(), join(orchestratorDir, "packages/web/dist"));
  const file = serveStatic({ root });
  const page = serveStatic({ root, path: "index.html" });
  app.get("/*", async (c, next) => {
    if (c.req.path.startsWith("/api/")) return await next();
    // A file of the build when there is one, else the app's page.
    return (await file(c, async () => {})) ?? (await page(c, next));
  });
}

const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
  logger.info("server started", { url: `http://127.0.0.1:${port}`, setup: describeSetup(services.config, fake) });
});

// Ctrl-C or a stop signal: refuse new run actions, cancel the agent runs in
// progress, wait for runs to settle and events to be written (at most
// SHUTDOWN_GRACE_MS), then close the server.
let stopping = false;
async function shutdown(signal: string) {
  if (stopping) process.exit(1); // a second signal: stop now
  stopping = true;
  logger.info("stopping", { signal });
  const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), SHUTDOWN_GRACE_MS).unref());
  try {
    const result = await Promise.race([services.supervisor.shutdown(), timeout]);
    if (result === "timeout") logger.info("runs did not stop in time; exiting anyway");
  } catch (error) {
    logger.error("shutdown failed", error);
  }
  server.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
