import { z } from "zod";

// A named, ordered group of workflows ("Discovery", "Delivery"), defined by
// the host project in .cursor/workflows/phases.json.
export const Phase = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  order: z.number(),
});

export const PhasesFile = z.strictObject({ phases: z.array(Phase) });

export type Phase = z.infer<typeof Phase>;
export type PhasesFile = z.infer<typeof PhasesFile>;

// The phases used when the host project has no phases.json.
export const DEFAULT_PHASES: Phase[] = [
  { id: "discovery", name: "Discovery", order: 1 },
  { id: "delivery", name: "Delivery", order: 2 },
];
