import { ConflictError, FileChangedError, InvalidInputError, MissingCredentialsError, NotFoundError } from "@orch/core";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { errorResponse } from "../../src/routes/errors";

// An app whose only route throws `error`, mapped by errorResponse.
async function answerFor(error: Error) {
  const reported: unknown[] = [];
  const app = new Hono()
    .get("/", () => {
      throw error;
    })
    .onError((e, c) => errorResponse(e, c, (r) => reported.push(r)));
  const response = await app.request("/");
  return { status: response.status, body: await response.json(), reported };
}

describe("errorResponse", () => {
  it("maps each known error to its status and body", async () => {
    const problems = [{ severity: "error" as const, message: "bad" }];
    expect(await answerFor(new InvalidInputError("nope", problems))).toMatchObject({ status: 400, body: { error: "nope: bad", problems } });
    expect(await answerFor(new NotFoundError("no run"))).toMatchObject({ status: 404, body: { error: "no run" } });
    expect(await answerFor(new ConflictError("busy"))).toMatchObject({ status: 409, body: { error: "busy" } });
    expect(await answerFor(new FileChangedError("kb/a.md", "v2"))).toMatchObject({ status: 409, body: { error: '"kb/a.md" changed on disk since it was opened', version: "v2" } });
    expect(await answerFor(new MissingCredentialsError("CURSOR_API_KEY"))).toMatchObject({ status: 503, body: { error: "CURSOR_API_KEY is not set" } });
  });

  it("answers 500 without the message, and reports the error", async () => {
    const error = new Error("secret details");
    const answer = await answerFor(error);
    expect(answer).toMatchObject({ status: 500, body: { error: "internal error" } });
    expect(answer.reported).toEqual([error]);
  });
});
