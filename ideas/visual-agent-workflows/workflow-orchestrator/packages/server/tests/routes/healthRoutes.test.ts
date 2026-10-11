import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testServer } from "../support/testServer";

let server: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => {
  server = await testServer();
});
afterAll(async () => await server.cleanup());

describe("GET /api/health", () => {
  it("answers ok with the node version and the agent runtime", async () => {
    const response = await server.app.request("/api/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, node: process.version, runtime: "fake" });
  });

  it("is not served outside /api", async () => {
    expect((await server.app.request("/health")).status).toBe(404);
  });
});
