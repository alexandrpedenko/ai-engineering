import { z } from "zod";
import { RuntimeKind } from "./config";

// workflow-orchestrator/settings.json: this machine's choices, kept out of git.
// Only these keys; everything about how projects are laid out stays in
// orchestrator.config.json.
export const LocalSettings = z.strictObject({
  projectRoot: z.string().min(1).optional(),
  runtime: RuntimeKind.optional(),
  models: z.strictObject({ cursor: z.string().optional(), claude: z.string().optional() }).optional(),
});

export type LocalSettings = z.infer<typeof LocalSettings>;

// Where a resolved setting came from, so the app can say so.
export type SettingSource = "override" | "settings.json" | "orchestrator.config.json" | "default";
