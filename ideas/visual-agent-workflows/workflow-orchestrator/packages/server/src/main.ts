import { serve } from "@hono/node-server";
import { createApp, createServerServices } from "./composition";

const port = Number(process.env.ORCH_PORT ?? 4317);
const projectRoot = process.env.ORCH_PROJECT_ROOT;
const services = await createServerServices({ ...(projectRoot ? { projectRoot } : {}), fake: process.env.ORCH_FAKE === "1" });

serve({ fetch: createApp(services).fetch, port }, () => {
  const mode = process.env.ORCH_FAKE === "1" ? " (fake agent)" : "";
  console.log(`orchestrator server on http://localhost:${port}${mode}, project ${services.config.projectRoot}`);
});
