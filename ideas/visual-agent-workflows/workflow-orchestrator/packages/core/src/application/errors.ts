import type { Problem } from "../domain/validate";

// orchestrator.config.json can't be used: bad JSON, a bad key, or a project
// root that doesn't exist. `problems` names each key that is wrong.
export class InvalidConfigError extends Error {
  readonly configPath: string;
  readonly problems: { key: string; message: string }[];

  constructor(configPath: string, problems: { key: string; message: string }[]) {
    super(`Invalid orchestrator config (${configPath}): ${problems.map((p) => `${p.key}: ${p.message}`).join("; ")}`);
    this.name = "InvalidConfigError";
    this.configPath = configPath;
    this.problems = problems;
  }
}

// A request the caller can fix: a workflow with errors, a missing input, a
// malformed gate decision. `problems` says what to fix.
export class InvalidInputError extends Error {
  readonly problems: Problem[];

  constructor(message: string, problems: Problem[] = []) {
    super(problems.length > 0 ? `${message}: ${problems.map((p) => p.message).join("; ")}` : message);
    this.name = "InvalidInputError";
    this.problems = problems;
  }
}

// The request doesn't fit the current state, e.g. resuming a run that isn't
// waiting at a gate.
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
