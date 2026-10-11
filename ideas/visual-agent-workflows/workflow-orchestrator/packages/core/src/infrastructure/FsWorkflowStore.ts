import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { z } from "zod";
import { InvalidInputError } from "../application/errors";
import type { WorkflowStore } from "../application/WorkflowStore";
import type { ResolvedConfig } from "../domain/config";
import { DEFAULT_PHASES, type Phase, PhasesFile } from "../domain/phase";
import { Workflow } from "../domain/workflow";

// WorkflowStore on <host>/<workflowsDir>/: <id>.json per workflow, phases.json.
export class FsWorkflowStore implements WorkflowStore {
  private readonly dir: string;

  constructor(config: ResolvedConfig) {
    this.dir = join(config.projectRoot, config.workflowsDir);
  }

  async get(id: string): Promise<Workflow | null> {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) return null;
    return await this.read(`${id}.json`, Workflow);
  }

  async phases(): Promise<Phase[]> {
    return (await this.read("phases.json", PhasesFile))?.phases ?? DEFAULT_PHASES;
  }

  // The file parsed with the schema; null when it doesn't exist.
  private async read<T>(name: string, schema: z.ZodType<T>): Promise<T | null> {
    const path = join(this.dir, name);
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
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
