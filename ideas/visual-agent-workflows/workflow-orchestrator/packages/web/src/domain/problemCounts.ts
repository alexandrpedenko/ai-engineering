import type { Problem } from "@orch/core";

// How many errors and warnings a list of problems has.
export function problemCounts(problems: Problem[]): { errors: number; warnings: number } {
  const errors = problems.filter((p) => p.severity === "error").length;
  return { errors, warnings: problems.length - errors };
}
