import { execFile } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createApp, createServerServices, orchestratorDir } from "../../src/composition";

const run = promisify(execFile);

// Runs git in `cwd` with a test author, and returns its output.
export async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await run("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], { cwd })).stdout;
}

// The HTTP app over real services on a temp copy of the sample project, with
// its data in the same temp folder. `fake: false` uses the Cursor runtime,
// which needs CURSOR_API_KEY. `git: true` makes the copy a git repository
// with everything committed.
export async function testServer(options: { fake?: boolean; git?: boolean } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "orch-server-"));
  const projectRoot = join(dir, "host");
  await cp(join(orchestratorDir, "fixtures/sample-project"), projectRoot, { recursive: true });
  if (options.git) {
    await git(projectRoot, "init", "-q");
    await git(projectRoot, "add", "-A");
    await git(projectRoot, "commit", "-q", "-m", "sample project");
  }
  const services = await createServerServices({ projectRoot, dataDir: join(dir, "data"), fake: options.fake ?? true });
  const app = createApp(services);
  return { app, services, projectRoot, dataDir: join(dir, "data"), cleanup: async () => await rm(dir, { recursive: true, force: true }) };
}

// A request with no body, sent as JSON like the web app sends it.
export const action = (method: string): RequestInit => ({ method, headers: { "content-type": "application/json" } });

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
