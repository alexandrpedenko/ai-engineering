import type { Problem } from "@orch/core";

// A request the server answered with an error. `message` is the server's
// `error`; `problems` what to fix (for a 400).
export class ApiError extends Error {
  readonly status: number;
  readonly problems: Problem[];

  constructor(status: number, message: string, problems: Problem[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.problems = problems;
  }
}

// Whether an error is the server saying "not found".
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
