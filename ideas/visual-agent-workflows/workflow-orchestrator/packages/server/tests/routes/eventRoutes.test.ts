import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startToGate, testServer } from "../support/testServer";

let server: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => {
  server = await testServer();
});
afterAll(async () => await server.cleanup());

// Reads an SSE response until an event of type `until` arrives, then closes it.
// Returns [id, event type] pairs.
async function readEvents(response: Response, until = "run-settled"): Promise<[string, string][]> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("no body");
  const decoder = new TextDecoder();
  let text = "";
  while (!text.includes(`event: ${until}`)) {
    const chunk = await reader.read();
    if (chunk.done) break;
    text += decoder.decode(chunk.value);
  }
  await reader.cancel();
  return text
    .split("\n\n")
    .filter((block) => block.trim())
    .map((block) => {
      const field = (name: string) => block.split("\n").find((line) => line.startsWith(`${name}: `))?.slice(name.length + 2) ?? "";
      return [field("id"), field("event")] as [string, string];
    });
}

describe("GET /api/runs/:runId/events", () => {
  it("streams a run's events from the start to run-settled", async () => {
    const runId = await startToGate(server);

    const response = await server.app.request(`/api/runs/${runId}/events`);

    expect(response.headers.get("content-type")).toMatch(/text\/event-stream/);
    expect(await readEvents(response)).toEqual([
      ["1", "step-started"],
      ["2", "step-finished"],
      ["3", "gate-waiting"],
      ["4", "run-settled"],
    ]);
  });

  it("skips what the client already has, by ?after= or Last-Event-ID", async () => {
    const runId = await startToGate(server);

    const byQuery = await readEvents(await server.app.request(`/api/runs/${runId}/events?after=2`));
    const byHeader = await readEvents(await server.app.request(`/api/runs/${runId}/events`, { headers: { "Last-Event-ID": "2" } }));

    expect(byQuery.map(([id]) => id)).toEqual(["3", "4"]);
    expect(byHeader).toEqual(byQuery);
  });

  it("passes on live events as the run moves", async () => {
    const runId = await startToGate(server);
    const response = await server.app.request(`/api/runs/${runId}/events?after=4`);

    await server.app.request(`/api/runs/${runId}/resume`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });

    expect((await readEvents(response)).map(([, type]) => type)).toEqual(["step-started", "step-finished", "run-settled"]);
  });

  it("answers 404 for an unknown run", async () => {
    expect((await server.app.request("/api/runs/run-nope/events")).status).toBe(404);
  });
});
