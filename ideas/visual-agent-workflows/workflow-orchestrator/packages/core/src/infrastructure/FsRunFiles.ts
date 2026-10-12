import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { RunFiles, RunRef, SavedRun } from "../application/RunFiles";
import { assertRunId } from "../domain/runId";
import { GitObjectId } from "../domain/runState";
import { Workflow } from "../domain/workflow";
import { isErrno } from "./isErrno";
import { writeJsonAtomic } from "./writeJsonAtomic";

// The format these files are written in. A file without formatVersion is 1.
const FORMAT_VERSION = 1;

const SnapshotFile = z.object({
  hashes: z.record(z.string(), z.string()),
  matches: z.record(z.string(), z.array(z.string())),
});
const RunFile = z.object({
  formatVersion: z.literal(FORMAT_VERSION).default(FORMAT_VERSION),
  workflow: Workflow,
  inputs: z.record(z.string(), z.string()),
  startedAt: z.string().default(""),
});
// Refs written before slice 9 call the agent run id "cursorRunId".
const RefFile = z.preprocess(
  (value) =>
    typeof value === "object" && value !== null && "cursorRunId" in value && !("agentRunId" in value)
      ? { ...value, agentRunId: (value as { cursorRunId: unknown }).cursorRunId }
      : value,
  z.object({
    formatVersion: z.literal(FORMAT_VERSION).default(FORMAT_VERSION),
    runId: z.string(),
    stepId: z.string(),
    attempt: z.number().int(),
    agentRunId: z.string(),
    before: SnapshotFile,
    baseTree: GitObjectId.nullable().default(null),
    startedAt: z.string(),
  }),
);

async function readJson(path: string): Promise<unknown | null> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (isErrno(error, "ENOENT")) return null;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

// RunFiles as JSON under <dataDir>/runs/<runId>/: run.json for the workflow
// and inputs, refs/<stepId>-<attempt>.json for each agent run. Files are
// written whole (temporary file + rename) and carry a formatVersion.
export class FsRunFiles implements RunFiles {
  constructor(
    private readonly dataDir: string,
    // Told about a run folder whose run.json can't be read; listRuns leaves it out.
    private readonly reportError: (error: unknown) => void = () => {},
  ) {}

  async saveRun(runId: string, run: SavedRun): Promise<void> {
    await writeJsonAtomic(join(this.runDir(runId), "run.json"), { formatVersion: FORMAT_VERSION, ...run });
  }

  async loadRun(runId: string): Promise<SavedRun | null> {
    const raw = await readJson(join(this.runDir(runId), "run.json"));
    if (raw === null) return null;
    const { formatVersion: _, ...run } = RunFile.parse(raw);
    return run;
  }

  async listRuns(): Promise<{ runId: string; workflowId: string; startedAt: string }[]> {
    let ids: string[];
    try {
      ids = (await readdir(join(this.dataDir, "runs"), { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
    } catch (error) {
      if (isErrno(error, "ENOENT")) return [];
      throw error;
    }
    const runs: { runId: string; workflowId: string; startedAt: string }[] = [];
    for (const runId of ids) {
      try {
        const run = await this.loadRun(runId);
        if (run) runs.push({ runId, workflowId: run.workflow.id, startedAt: run.startedAt });
      } catch (error) {
        this.reportError(new Error(`run "${runId}" can't be read: ${error instanceof Error ? error.message : String(error)}`));
      }
    }
    return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.runId.localeCompare(a.runId));
  }

  async getRef(runId: string, stepId: string, attempt: number): Promise<RunRef | null> {
    const raw = await readJson(this.refPath(runId, stepId, attempt));
    if (raw === null) return null;
    const { formatVersion: _, ...ref } = RefFile.parse(raw);
    return ref;
  }

  async putRef(ref: RunRef): Promise<void> {
    await writeJsonAtomic(this.refPath(ref.runId, ref.stepId, ref.attempt), { formatVersion: FORMAT_VERSION, ...ref });
  }

  async deleteRun(runId: string): Promise<void> {
    await rm(this.runDir(runId), { recursive: true, force: true });
  }

  private runDir(runId: string): string {
    assertRunId(runId);
    return join(this.dataDir, "runs", runId);
  }

  private refPath(runId: string, stepId: string, attempt: number): string {
    return join(this.runDir(runId), "refs", `${stepId}-${attempt}.json`);
  }
}
