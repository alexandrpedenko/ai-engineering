import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { localOnly } from "../../src/routes/localOnly";

const app = new Hono().use("*", localOnly()).all("/x", (c) => c.json({ ok: true }));
const send = (url: string, init: RequestInit = {}) => app.request(url, init);
const json = { "content-type": "application/json" };

describe("localOnly", () => {
  it("lets through requests to a local host name, with no origin or a local one", async () => {
    expect((await send("http://localhost/x")).status).toBe(200);
    expect((await send("http://127.0.0.1:4317/x", { headers: { origin: "http://localhost:5173" } })).status).toBe(200);
    expect((await send("http://[::1]:4317/x", { method: "POST", headers: { ...json, origin: "http://127.0.0.1:5173" }, body: "{}" })).status).toBe(200);
    expect((await send("http://localhost/x", { method: "POST" })).status).toBe(200);
  });

  it("refuses a request addressed to another host name (DNS rebinding)", async () => {
    const response = await send("http://evil.example:4317/x");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "this server only answers on localhost" });
  });

  it("refuses a request from another site's page", async () => {
    for (const origin of ["https://evil.example", "http://evil.example:4317", "null", "https://localhost:5173"]) {
      expect((await send("http://localhost/x", { headers: { origin } })).status).toBe(403);
    }
  });

  it("refuses a body that isn't JSON, which a cross-site page could send without asking", async () => {
    const response = await send("http://localhost/x", { method: "POST", headers: { "content-type": "text/plain" }, body: '{"inputs":{}}' });
    expect(response.status).toBe(415);
    expect((await send("http://localhost/x", { method: "PUT", body: "{}" })).status).toBe(415);
  });
});
