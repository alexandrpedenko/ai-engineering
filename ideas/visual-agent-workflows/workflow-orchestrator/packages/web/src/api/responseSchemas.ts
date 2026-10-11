import { z } from "zod";

// The shapes the UI relies on in each server answer. Loose: fields the UI
// doesn't read pass through unchecked (the server's own schemas made them).

const Problem = z.object({ severity: z.enum(["error", "warning"]), stepId: z.string().optional(), message: z.string() });
const Named = z.object({ name: z.string(), path: z.string(), description: z.string() }).loose();

export const Health = z.object({ ok: z.boolean(), runtime: z.string().optional() });
export const Registry = z
  .object({
    root: z.string(),
    skills: z.array(Named),
    agents: z.array(Named),
    artefacts: z.array(z.object({ path: z.string(), size: z.number() }).loose()),
    warnings: z.array(z.object({ path: z.string(), message: z.string() })),
  })
  .loose();
export const Phases = z.object({ phases: z.array(z.object({ id: z.string(), name: z.string(), order: z.number() }).loose()) });
export const WorkflowSummaries = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    phase: z.string().optional(),
    agents: z.array(z.string()),
    skills: z.array(z.string()),
    problems: z.array(Problem),
  }),
);
const Workflow = z
  .object({ id: z.string(), name: z.string(), steps: z.array(z.object({ id: z.string(), type: z.enum(["agent", "gate"]) }).loose()) })
  .loose();
export const WorkflowWithProblems = z.object({ workflow: Workflow, problems: z.array(Problem) });
export const Problems = z.object({ problems: z.array(Problem) });
export const RunSummaries = z.array(
  z.object({ runId: z.string(), workflowId: z.string(), startedAt: z.string(), status: z.string(), busy: z.boolean() }),
);
export const RunDetails = z
  .object({
    runId: z.string(),
    workflow: Workflow,
    inputs: z.record(z.string(), z.string()),
    startedAt: z.string(),
    busy: z.boolean(),
    outcome: z.object({ status: z.string(), state: z.object({}).loose() }).loose().nullable(),
  })
  .loose();
export const FileContent = z.object({ path: z.string(), content: z.string(), version: z.string() });
export const FileSaved = z.object({ version: z.string() });
export const Started = z.object({ runId: z.string() });
export const ErrorBody = z.object({ error: z.string(), problems: z.array(Problem).optional() }).loose();
export const LogEventData = z.object({ type: z.string() }).loose();
