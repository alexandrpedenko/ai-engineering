import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpOrchestratorApi } from "../../src/api/HttpOrchestratorApi";

function respondWith(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpOrchestratorApi.isServerUp", () => {
  it("calls /api/health and reads ok", async () => {
    const fetchMock = respondWith(200, { ok: true, node: "v25" });

    expect(await new HttpOrchestratorApi("http://srv").isServerUp()).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("http://srv/api/health");
  });

  it("is false on a non-2xx answer", async () => {
    respondWith(503, {});

    expect(await new HttpOrchestratorApi().isServerUp()).toBe(false);
  });

  it("rejects a body of the wrong shape", async () => {
    respondWith(200, { status: "fine" });

    await expect(new HttpOrchestratorApi().isServerUp()).rejects.toThrow();
  });
});
