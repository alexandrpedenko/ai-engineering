import { PhasesFile } from "../domain/phase";
import { InvalidInputError } from "./errors";
import type { WorkflowStore } from "./WorkflowStore";

// Saves the phases sent from outside. Refuses a body that isn't a phases file
// or that repeats a phase id.
export async function savePhases(store: WorkflowStore, body: unknown): Promise<void> {
  const parsed = PhasesFile.safeParse(body);
  if (!parsed.success) {
    throw new InvalidInputError(
      "not a valid phases file",
      parsed.error.issues.map((issue) => ({ severity: "error", message: `${issue.path.join(".") || "(body)"}: ${issue.message}` })),
    );
  }
  const ids = parsed.data.phases.map((p) => p.id);
  const repeated = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (repeated.length > 0) throw new InvalidInputError(`phase ids must be unique; repeated: ${[...new Set(repeated)].join(", ")}`);
  await store.savePhases(parsed.data.phases);
}
