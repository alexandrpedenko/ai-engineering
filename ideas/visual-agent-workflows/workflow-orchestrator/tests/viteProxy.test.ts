// The server accepts only requests whose Origin is its own address (ADR-0015).
// In development the browser talks to Vite on :5173, which proxies /api; the
// proxy must keep the browser's Host header, or every action is refused.
import { describe, expect, it } from "vitest";
import config from "../packages/web/vite.config";

describe("the Vite dev proxy", () => {
  it("forwards /api to the server without rewriting the Host header", () => {
    const proxy = (config as { server?: { proxy?: Record<string, unknown> } }).server?.proxy?.["/api"];
    expect(proxy).toMatchObject({ target: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/), changeOrigin: false });
  });
});
