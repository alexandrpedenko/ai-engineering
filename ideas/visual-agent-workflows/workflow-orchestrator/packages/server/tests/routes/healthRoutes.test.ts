import { describe, expect, it } from "vitest";
import { createApp } from "../../src/composition";

describe("GET /api/health", () => {
  it("answers ok with the node version", async () => {
    const response = await createApp().request("/api/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, node: process.version });
  });

  it("is not served outside /api", async () => {
    const response = await createApp().request("/health");

    expect(response.status).toBe(404);
  });
});
