import type { Phase } from "../domain/phase";
import type { Workflow } from "../domain/workflow";

// The host project's workflow files and phases (read side).
export interface WorkflowStore {
  // null when there is no such workflow file. A file that isn't a valid
  // workflow is an InvalidInputError naming the file.
  get(id: string): Promise<Workflow | null>;
  // The phases file, or DEFAULT_PHASES when there is none.
  phases(): Promise<Phase[]>;
}
