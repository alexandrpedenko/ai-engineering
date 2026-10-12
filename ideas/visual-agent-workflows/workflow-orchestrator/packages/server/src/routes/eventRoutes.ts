import type { LoggedEvent } from "@orch/core";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { ServerServices } from "./ServerServices";

// How often an idle stream sends a comment line, so proxies keep it open.
export const PING_MS = 20_000;

// The seq to replay after: the Last-Event-ID header a reconnecting browser
// sends, else ?after=, else 0.
export function afterOf(query: string | undefined, header: string | undefined): number {
  const value = Number(header ?? query ?? 0);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

// A run's events as Server-Sent Events: everything logged after `after`, then
// live events, until the client disconnects. id = seq, event = type. A
// comment line goes out after PING_MS without events.
export function eventRoutes(services: Pick<ServerServices, "supervisor">, pingMs = PING_MS) {
  return new Hono().get("/runs/:runId/events", async (c) => {
    const runId = c.req.param("runId");
    const after = afterOf(c.req.query("after"), c.req.header("Last-Event-ID"));

    const queue: LoggedEvent[] = [];
    let wake: () => void = () => {};
    // Throws NotFoundError before the stream opens, so an unknown run is a 404.
    const unsubscribe = await services.supervisor.watch(runId, after, (event) => {
      queue.push(event);
      wake();
    });

    return streamSSE(c, async (stream) => {
      let open = true;
      stream.onAbort(() => {
        open = false;
        unsubscribe();
        wake();
      });
      while (open) {
        const event = queue.shift();
        if (event) {
          await stream.writeSSE({ id: String(event.seq), event: event.event.type, data: JSON.stringify(event.event) });
        } else {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const pinged = await new Promise<boolean>((resolve) => {
            wake = () => resolve(false);
            timer = setTimeout(() => resolve(true), pingMs);
          });
          clearTimeout(timer);
          if (pinged && open) await stream.write(": ping\n\n");
        }
      }
    });
  });
}
