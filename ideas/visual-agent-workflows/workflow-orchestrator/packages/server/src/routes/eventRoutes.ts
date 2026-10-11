import type { LoggedEvent } from "@orch/core";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { ServerServices } from "./ServerServices";

// The seq to replay after: ?after=, else the Last-Event-ID header, else 0.
function afterOf(query: string | undefined, header: string | undefined): number {
  const value = Number(query ?? header ?? 0);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

// A run's events as Server-Sent Events: everything logged after `after`, then
// live events, until the client disconnects. id = seq, event = type.
export function eventRoutes(services: ServerServices) {
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
          await new Promise<void>((resolve) => (wake = resolve));
        }
      }
    });
  });
}
