# ADR-0015 — The server answers only local, JSON requests

**Status:** Accepted (2026-10-11). Found in the slice 6 security review.

## Context

The orchestrator's server has no login (spec non-goal: one developer, one
machine). Since slice 5.8 it listens on `127.0.0.1` only, which keeps other
machines out. It does not keep out **web pages the developer visits**:

- A page on another site can send a `POST` to `http://localhost:4317` with a
  `text/plain` body. The browser sends that without asking the server first
  ("simple request"), and the server used to parse any body as JSON. With
  `POST /api/workflows` (slice 6) such a page could create a workflow and
  start a run with its own instructions, on an agent that may edit files.
- A page whose own domain is made to resolve to `127.0.0.1` (DNS rebinding)
  becomes "same site" to the browser and can read and write project files
  through `/api/files`.

## Decision

One middleware in front of every `/api` route refuses:

- a request addressed to any host name other than `localhost`, `127.0.0.1`
  or `[::1]` (403), which stops DNS rebinding;
- a request with an `Origin` header that is not `http://` on one of those
  names (403), which stops other sites' pages;
- a request body that isn't `application/json` (415). A cross-site page can
  only send JSON after the browser asks the server first, and the server
  never says yes (no CORS headers).

## Consequences

- The web app (same origin, through the Vite proxy) and the CLI (no Origin)
  work unchanged; `HttpOrchestratorApi` already sends JSON bodies with their
  content type.
- Tools that call the API by hand must send `Content-Type: application/json`
  with a body, and use `localhost` or `127.0.0.1` in the URL.
- Serving the API under another host name (a tunnel, a container name)
  would need that name added. Not an MVP case.
- Sharing workflows between people is unaffected: workflow files live in the
  host project and travel through git (ADR-0001, ADR-0002). Each person pulls
  and runs their own orchestrator on their own machine; nobody connects to
  another person's server.

## Alternatives considered

- **A token in a header, printed at start-up.** Stronger, but every client
  (browser, CLI, scripts) would need it. Possible if the server ever leaves
  the developer's machine.
- **Rely on browsers' local-network protections.** Only some browsers have
  them, and they don't cover DNS rebinding.
