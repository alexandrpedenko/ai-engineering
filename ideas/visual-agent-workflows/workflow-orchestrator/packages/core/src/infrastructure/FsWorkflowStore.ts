import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { z } from "zod";
import { ConflictError, InvalidInputError, NotFoundError } from "../application/errors";
import type { WorkflowStore } from "../application/WorkflowStore";
import type { ResolvedConfig } from "../domain/config";
import { DEFAULT_PHASES, type Phase, PhasesFile } from "../domain/phase";
import { StepId, Workflow } from "../domain/workflow";
import { isErrno } from "./isErrno";

// WorkflowStore on <host>/<workflowsDir>/: <id>.json per workflow, phases.json.
// Files are written as JSON with two-space indents and a final newline.
export class FsWorkflowStore implements WorkflowStore {
  private readonly dir: string;

  constructor(config: ResolvedConfig) {
    this.dir = join(config.projectRoot, config.workflowsDir);
  }

  async get(id: string): Promise<Workflow | null> {
    if (!StepId.safeParse(id).success) return null;
    return await this.read(`${id}.json`, Workflow);
  }

  async list(): Promise<{ id: string; workflow: Workflow | null; error?: string }[]> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch (error) {
      if (isErrno(error, "ENOENT")) return [];
      throw error;
    }
    const ids = names.filter((n) => n.endsWith(".json") && n !== "phases.json").map((n) => n.slice(0, -5)).sort();
    const entries: { id: string; workflow: Workflow | null; error?: string }[] = [];
    for (const id of ids) {
      try {
        entries.push({ id, workflow: await this.read(`${id}.json`, Workflow) });
      } catch (error) {
        if (!(error instanceof InvalidInputError)) throw error;
        entries.push({ id, workflow: null, error: error.message });
      }
    }
    return entries;
  }

  async save(workflow: Workflow): Promise<void> {
    await this.write(`${workflow.id}.json`, workflow);
  }

  async create(workflow: Workflow): Promise<void> {
    try {
      await this.write(`${workflow.id}.json`, workflow, "wx");
    } catch (error) {
      if (isErrno(error, "EEXIST")) throw new ConflictError(`a workflow "${workflow.id}" already exists`);
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    if (!StepId.safeParse(id).success) throw new NotFoundError(`no workflow "${id}"`);
    try {
      await unlink(join(this.dir, `${id}.json`));
    } catch (error) {
      if (isErrno(error, "ENOENT")) throw new NotFoundError(`no workflow "${id}"`);
      throw error;
    }
  }

  async phases(): Promise<Phase[]> {
    return (await this.read("phases.json", PhasesFile))?.phases ?? DEFAULT_PHASES;
  }

  async savePhases(phases: Phase[]): Promise<void> {
    await this.write("phases.json", { phases });
  }

  // Writes the file; flag "wx" fails with EEXIST instead of replacing one.
  private async write(name: string, value: unknown, flag: "w" | "wx" = "w"): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, name), `${JSON.stringify(value, null, 2)}\n`, { flag });
  }

  // The file parsed with the schema; null when it doesn't exist.
  private async read<T>(name: string, schema: z.ZodType<T>): Promise<T | null> {
    const path = join(this.dir, name);
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (error) {
      if (isErrno(error, "ENOENT")) return null;
      throw error;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      throw new InvalidInputError(`${path} is not valid JSON`, [{ severity: "error", message: (error as Error).message }]);
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const problems = parsed.error.issues.map((issue) => ({
        severity: "error" as const,
        message: `${issue.path.join(".") || "(file)"}: ${issue.message}`,
      }));
      throw new InvalidInputError(`${path} is not a valid ${name === "phases.json" ? "phases file" : "workflow"}`, problems);
    }
    return parsed.data;
  }
}
