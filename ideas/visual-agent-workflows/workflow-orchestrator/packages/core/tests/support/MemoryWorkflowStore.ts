import { NotFoundError } from "../../src/application/errors";
import type { WorkflowStore } from "../../src/application/WorkflowStore";
import { DEFAULT_PHASES, type Phase } from "../../src/domain/phase";
import type { Workflow } from "../../src/domain/workflow";

// WorkflowStore kept in memory. `broken` lists ids whose files can't be read.
export class MemoryWorkflowStore implements WorkflowStore {
  readonly workflows = new Map<string, Workflow>();
  broken = new Map<string, string>();
  savedPhases: Phase[] | null = null;

  constructor(workflows: Workflow[] = []) {
    for (const workflow of workflows) this.workflows.set(workflow.id, workflow);
  }

  async get(id: string) {
    return this.workflows.get(id) ?? null;
  }

  async list() {
    const ok = [...this.workflows.entries()].map(([id, workflow]) => ({ id, workflow }));
    const bad = [...this.broken.entries()].map(([id, error]) => ({ id, workflow: null, error }));
    return [...ok, ...bad].sort((a, b) => a.id.localeCompare(b.id));
  }

  async save(workflow: Workflow) {
    this.workflows.set(workflow.id, workflow);
  }

  async remove(id: string) {
    if (!this.workflows.delete(id)) throw new NotFoundError(`no workflow "${id}"`);
  }

  async phases() {
    return this.savedPhases ?? DEFAULT_PHASES;
  }

  async savePhases(phases: Phase[]) {
    this.savedPhases = phases;
  }
}
