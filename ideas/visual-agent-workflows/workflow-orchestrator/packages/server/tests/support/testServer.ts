import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, createServerServices, orchestratorDir } from "../../src/composition";

// The HTTP app over real services on a temp copy of the sample project, with
// its data in the same temp folder. `fake: false` uses the Cursor runtime,
// which needs CURSOR_API_KEY.
export async function testServer(options: { fake?: boolean } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "orch-server-"));
  const projectRoot = join(dir, "host");
  await cp(join(orchestratorDir, "fixtures/sample-project"), projectRoot, { recursive: true });
  const services = await createServerServices({ projectRoot, dataDir: join(dir, "data"), fake: options.fake ?? true });
  const app = createApp(services);
  return { app, services, projectRoot, dataDir: join(dir, "data"), cleanup: async () => await rm(dir, { recursive: true, force: true }) };
}

export const jsonBody = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

// Starts the sample BA workflow and waits until it stops at its gate.
export async function startToGate(server: Awaited<ReturnType<typeof testServer>>) {
  const response = await server.app.request("/api/workflows/ba-discovery/runs", jsonBody("POST", { inputs: { focus: "pricing" } }));
  const { runId } = (await response.json()) as { runId: string };
  await server.services.supervisor.settled(runId);
  return runId;
}
