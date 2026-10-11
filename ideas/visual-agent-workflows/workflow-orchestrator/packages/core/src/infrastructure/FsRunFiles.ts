import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { RunFiles, RunRef, SavedRun } from "../application/RunFiles";
import { Workflow } from "../domain/workflow";

const SnapshotFile = z.object({
  hashes: z.record(z.string(), z.string()),
  matches: z.record(z.string(), z.array(z.string())),
});
const RunFile = z.object({ workflow: Workflow, inputs: z.record(z.string(), z.string()), startedAt: z.string().default("") });
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

  async saveRun(runId: string, run: SavedRun): Promise<void> {
    await mkdir(this.runDir(runId), { recursive: true });
    await writeFile(join(this.runDir(runId), "run.json"), JSON.stringify(run, null, 2));
  }

  async loadRun(runId: string): Promise<SavedRun | null> {
    const raw = await readJson(join(this.runDir(runId), "run.json"));
    return raw === null ? null : RunFile.parse(raw);
  }

  async listRuns(): Promise<{ runId: string; workflowId: string; startedAt: string }[]> {
    let ids: string[];
    try {
      ids = (await readdir(join(this.dataDir, "runs"), { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const runs: { runId: string; workflowId: string; startedAt: string }[] = [];
    for (const runId of ids) {
      const run = await this.loadRun(runId);
      if (run) runs.push({ runId, workflowId: run.workflow.id, startedAt: run.startedAt });
    }
    return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.runId.localeCompare(a.runId));
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
