import { InvalidInputError } from "@orch/core";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { readJson } from "../../src/routes/readJson";

const app = new Hono()
  .post("/", async (c) => c.json({ got: await readJson(c) }))
  .onError((error, c) => c.json({ invalid: error instanceof InvalidInputError }, 400));

describe("readJson", () => {
  it("returns the parsed body", async () => {
    const response = await app.request("/", { method: "POST", body: '{"a":1}', headers: { "content-type": "application/json" } });
    expect(await response.json()).toEqual({ got: { a: 1 } });
  });

  it("throws InvalidInputError for a body that isn't JSON", async () => {
    const response = await app.request("/", { method: "POST", body: "nope" });
    expect(await response.json()).toEqual({ invalid: true });
  });
});
