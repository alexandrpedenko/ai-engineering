import { InvalidInputError } from "@orch/core";
import type { Context } from "hono";

// The request body as JSON. A body that isn't JSON is an InvalidInputError (400).
export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new InvalidInputError("the request body must be JSON");
  }
}
