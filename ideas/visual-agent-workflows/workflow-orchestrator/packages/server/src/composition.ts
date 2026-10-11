import { scanProject } from "@orch/core";
import { FsProjectFiles, loadConfig } from "@orch/core/infrastructure";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { healthRoutes } from "./routes/healthRoutes";

// The workflow-orchestrator folder (three levels above this file).
export const orchestratorDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

// Builds the HTTP app: creates adapters, hands them to use cases, mounts routes.
export function createApp() {
  return new Hono().route("/api", healthRoutes());
}

// The config and the use cases for one host project. `projectRoot` overrides
// the config file (relative to the orchestrator folder).
export async function createProjectServices(options: { projectRoot?: string } = {}) {
  const config = await loadConfig(orchestratorDir, options);
  const files = new FsProjectFiles(config);
  return { config, scan: async () => await scanProject(files) };
}
