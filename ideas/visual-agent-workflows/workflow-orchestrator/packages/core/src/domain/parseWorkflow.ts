import type { Problem } from "./validate";
import { Workflow } from "./workflow";

export type ParsedWorkflow = { ok: true; workflow: Workflow } | { ok: false; problems: Problem[] };

// Reads a value from outside (a request body) as a workflow. When it isn't
// one, says why: one error problem per schema issue, named by its path.
export function parseWorkflow(value: unknown): ParsedWorkflow {
  const parsed = Workflow.safeParse(value);
  if (parsed.success) return { ok: true, workflow: parsed.data };
  return {
    ok: false,
    problems: parsed.error.issues.map((issue) => ({ severity: "error", message: `${issue.path.join(".") || "(body)"}: ${issue.message}` })),
  };
}
