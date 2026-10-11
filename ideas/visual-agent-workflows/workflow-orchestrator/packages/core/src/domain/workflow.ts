import { z } from "zod";

// Step and workflow ids: lowercase, digits and dashes, starting with a letter.
// A step id is also the name of its graph node.
export const StepId = z.string().regex(/^[a-z][a-z0-9-]*$/, "use lowercase letters, digits and dashes, starting with a letter");

export const WorkflowInput = z.strictObject({
  id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  label: z.string(),
  type: z.literal("text"),
  required: z.boolean().default(false),
});

// A step run by an agent: who does it, which skills it must follow, what it
// is told, what it reads and what it must write.
export const AgentStep = z.strictObject({
  id: StepId,
  type: z.literal("agent"),
  label: z.string(),
  agent: z.string(),
  skills: z.array(z.string()).default([]),
  instructions: z.string(),
  reads: z.array(z.string()).default([]),
  writes: z.array(z.string()).default([]),
  model: z.string().nullable().default(null),
});

// A step where a person reviews files and approves, or rejects with feedback
// that sends the work back to `onReject`, at most `maxRevisions` times.
export const GateStep = z.strictObject({
  id: StepId,
  type: z.literal("gate"),
  label: z.string(),
  shows: z.array(z.string()).default([]),
  onReject: StepId,
  maxRevisions: z.number().int().min(0).default(3),
});

export const Step = z.discriminatedUnion("type", [AgentStep, GateStep]);

export const Edge = z.strictObject({ from: StepId, to: StepId });

export const Workflow = z.strictObject({
  schema: z.literal(1),
  id: StepId,
  name: z.string(),
  phase: z.string().optional(),
  inputs: z.array(WorkflowInput).default([]),
  steps: z.array(Step).min(1),
  edges: z.array(Edge).default([]),
  layout: z.record(z.string(), z.object({ x: z.number(), y: z.number() })).default({}),
});

export type WorkflowInput = z.infer<typeof WorkflowInput>;
export type AgentStep = z.infer<typeof AgentStep>;
export type GateStep = z.infer<typeof GateStep>;
export type Step = z.infer<typeof Step>;
export type Edge = z.infer<typeof Edge>;
export type Workflow = z.infer<typeof Workflow>;
