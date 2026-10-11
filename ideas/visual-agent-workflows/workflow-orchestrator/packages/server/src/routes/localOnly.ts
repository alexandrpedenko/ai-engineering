import type { MiddlewareHandler } from "hono";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const isLocalOrigin = (origin: string) => {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);
  } catch {
    return false; // "null" or garbage: not a page on this machine
  }
};

// Lets through only requests a page on this machine could make: addressed to
// a local host name (so a site that points its own name at 127.0.0.1 is
// refused), with no Origin or a local one (so another site's page is
// refused), and with a body only when it is JSON (a cross-site page can't
// send that without the browser asking first, and the server never says yes).
export function localOnly(): MiddlewareHandler {
  return async (c, next) => {
    if (!LOCAL_HOSTS.has(new URL(c.req.url).hostname)) return c.json({ error: "this server only answers on localhost" }, 403);
    const origin = c.req.header("origin");
    if (origin !== undefined && !isLocalOrigin(origin)) return c.json({ error: "requests from other sites are refused" }, 403);
    const type = c.req.header("content-type") ?? "";
    if (c.req.raw.body !== null && !/^application\/json\b/i.test(type)) return c.json({ error: "the request body must be application/json" }, 415);
    await next();
  };
}
