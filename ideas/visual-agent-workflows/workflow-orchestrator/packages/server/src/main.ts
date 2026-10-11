import { serve } from "@hono/node-server";
import { createApp, createServerServices, describeSetup } from "./composition";

const port = Number(process.env.ORCH_PORT ?? 4317);
const projectRoot = process.env.ORCH_PROJECT_ROOT;
const services = await createServerServices({ ...(projectRoot ? { projectRoot } : {}), fake: process.env.ORCH_FAKE === "1" });

serve({ fetch: createApp(services).fetch, port }, () => {
  console.log(`orchestrator server on http://localhost:${port}`);
  console.log(describeSetup(services.config, process.env.ORCH_FAKE === "1"));
});
