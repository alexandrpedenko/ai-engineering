import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { RunFiles, RunRef } from "../application/RunFiles";
import { Workflow } from "../domain/workflow";

const SnapshotFile = z.object({
  hashes: z.record(z.string(), z.string()),
  matches: z.record(z.string(), z.array(z.string())),
});
const RunFile = z.object({ workflow: Workflow, inputs: z.record(z.string(), z.string()) });
const RefFile = z.object({
  runId: z.string(),
  stepId: z.string(),
  attempt: z.number().int(),
  cursorRunId: z.string(),
  before: SnapshotFile,
  startedAt: z.string(),
});

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

// RunFiles as JSON under <dataDir>/runs/<runId>/: run.json for the workflow
// and inputs, refs/<stepId>-<attempt>.json for each agent run.
export class FsRunFiles implements RunFiles {
  constructor(private readonly dataDir: string) {}

  async saveRun(runId: string, workflow: Workflow, inputs: Record<string, string>): Promise<void> {
    await mkdir(this.runDir(runId), { recursive: true });
    await writeFile(join(this.runDir(runId), "run.json"), JSON.stringify({ workflow, inputs }, null, 2));
  }

  async loadRun(runId: string): Promise<{ workflow: Workflow; inputs: Record<string, string> } | null> {
    const raw = await readJson(join(this.runDir(runId), "run.json"));
    return raw === null ? null : RunFile.parse(raw);
  }

  async getRef(runId: string, stepId: string, attempt: number): Promise<RunRef | null> {
    const raw = await readJson(this.refPath(runId, stepId, attempt));
    return raw === null ? null : RefFile.parse(raw);
  }

  async putRef(ref: RunRef): Promise<void> {
    await mkdir(join(this.runDir(ref.runId), "refs"), { recursive: true });
    await writeFile(this.refPath(ref.runId, ref.stepId, ref.attempt), JSON.stringify(ref, null, 2));
  }

  private runDir(runId: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error(`invalid run id "${runId}"`);
    return join(this.dataDir, "runs", runId);
  }

  private refPath(runId: string, stepId: string, attempt: number): string {
    return join(this.runDir(runId), "refs", `${stepId}-${attempt}.json`);
  }
}
