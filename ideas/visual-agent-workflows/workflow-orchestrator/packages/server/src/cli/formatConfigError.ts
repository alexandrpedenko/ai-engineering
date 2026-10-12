import type { InvalidConfigError } from "@orch/core";

// An unusable config as terminal lines: the file, then each key and what is wrong.
export function formatConfigError(error: InvalidConfigError): string {
  return `Invalid config in ${error.configPath}\n${error.problems.map((p) => `  ${p.key}: ${p.message}`).join("\n")}\n`;
}
