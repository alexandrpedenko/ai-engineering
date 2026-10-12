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

// A file changed on disk since the caller read it, so saving would overwrite
// that change. `version` is the file's version now.
export class FileChangedError extends ConflictError {
  readonly version: string;

  constructor(path: string, version: string) {
    super(`"${path}" changed on disk since it was opened`);
    this.name = "FileChangedError";
    this.version = version;
  }
}

// The thing asked for doesn't exist: a workflow file, a run.
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

// A credential the chosen runtime needs is not set. Names the variable, never its value.
export class MissingCredentialsError extends Error {
  readonly variable: string;

  constructor(variable: string) {
    super(`${variable} is not set`);
    this.name = "MissingCredentialsError";
    this.variable = variable;
  }
}

// A run stopped with an error instead of settling: the engine or an agent
// step threw. The run is left interrupted and can be continued.
export class RunCrashedError extends Error {
  readonly runId: string;

  constructor(runId: string, message: string) {
    super(message);
    this.name = "RunCrashedError";
    this.runId = runId;
  }
}
