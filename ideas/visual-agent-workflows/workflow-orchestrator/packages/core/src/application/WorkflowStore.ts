import type { Phase } from "../domain/phase";
import type { Workflow } from "../domain/workflow";

// The host project's workflow files and phases.
export interface WorkflowStore {
  // null when there is no such workflow file. A file that isn't a valid
  // workflow is an InvalidInputError naming the file.
  get(id: string): Promise<Workflow | null>;
  // Every workflow file; one that can't be read is listed with its error.
  list(): Promise<{ id: string; workflow: Workflow | null; error?: string }[]>;
  save(workflow: Workflow): Promise<void>;
  // Saves a workflow under an id that has no file yet. ConflictError when a
  // file with that id exists, readable or not; nothing is overwritten.
  create(workflow: Workflow): Promise<void>;
  // NotFoundError when there is no such workflow file.
  remove(id: string): Promise<void>;
  // The phases file, or DEFAULT_PHASES when there is none.
  phases(): Promise<Phase[]>;
  savePhases(phases: Phase[]): Promise<void>;
}
