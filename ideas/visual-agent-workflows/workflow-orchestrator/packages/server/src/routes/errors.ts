import { ConflictError, FileChangedError, InvalidInputError, MissingCredentialsError, NotFoundError } from "@orch/core";
import type { Context } from "hono";

// The one place an error becomes an HTTP response. Unknown errors answer 500
// without their message; `report` gets the details.
export function errorResponse(error: Error, c: Context, report: (error: unknown) => void = console.error) {
  if (error instanceof InvalidInputError) return c.json({ error: error.message, problems: error.problems }, 400);
  if (error instanceof NotFoundError) return c.json({ error: error.message }, 404);
  if (error instanceof FileChangedError) return c.json({ error: error.message, version: error.version }, 409);
  if (error instanceof ConflictError) return c.json({ error: error.message }, 409);
  if (error instanceof MissingCredentialsError) return c.json({ error: `${error.variable} is not set` }, 503);
  report(error);
  return c.json({ error: "internal error" }, 500);
}
