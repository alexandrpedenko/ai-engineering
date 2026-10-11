import { serve } from "@hono/node-server";
import { createApp } from "./composition";

const port = Number(process.env.ORCH_PORT ?? 4317);

serve({ fetch: createApp().fetch, port }, () => {
  console.log(`orchestrator server on http://localhost:${port}`);
});
