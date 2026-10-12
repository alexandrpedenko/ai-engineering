import type { MiddlewareHandler } from "hono";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// The port a URL addresses, with the scheme's default when it names none.
const portOf = (url: URL) => url.port || (url.protocol === "https:" ? "443" : "80");

// Whether `origin` is a page served by this same server: http, a local host
// name, and the port the request was sent to. Pages on other local ports
// (another dev server) are not.
const isOwnOrigin = (origin: string, request: URL) => {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname) && portOf(url) === portOf(request);
  } catch {
    return false; // "null" or garbage: not a page on this machine
  }
};

// Lets through only requests a page of this app could make: addressed to a
// local host name (so a site that points its own name at 127.0.0.1 is
// refused), with no Origin or this server's own (so another site's page, or
// another local server's, is refused), and, for anything but GET and HEAD,
// saying its body is JSON (a cross-site page can't send that without the
// browser asking first, and the server never says yes).
export function localOnly(): MiddlewareHandler {
  return async (c, next) => {
    const url = new URL(c.req.url);
    if (!LOCAL_HOSTS.has(url.hostname)) return c.json({ error: "this server only answers on localhost" }, 403);
    const origin = c.req.header("origin");
    if (origin !== undefined && !isOwnOrigin(origin, url)) return c.json({ error: "requests from other sites are refused" }, 403);
    const reads = c.req.method === "GET" || c.req.method === "HEAD";
    if (!reads && !/^application\/json\b/i.test(c.req.header("content-type") ?? "")) {
      return c.json({ error: "the request must be sent as application/json" }, 415);
    }
    await next();
    return undefined;
  };
}
