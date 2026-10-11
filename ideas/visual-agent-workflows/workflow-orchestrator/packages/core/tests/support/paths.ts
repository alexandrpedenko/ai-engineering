import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The workflow-orchestrator folder and its sample host project.
export const orchestratorDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
export const sampleProject = join(orchestratorDir, "fixtures/sample-project");

// A fresh temp folder holding a copy of the sample project, for tests that
// add broken or extra files.
export async function copyOfSampleProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "orch-sample-"));
  await cp(sampleProject, dir, { recursive: true });
  return dir;
}
