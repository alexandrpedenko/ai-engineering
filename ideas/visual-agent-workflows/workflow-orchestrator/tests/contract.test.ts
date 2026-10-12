// The web app reads the server's answers through responseSchemas. This runs
// a real server (fake agent, temp git copy of the sample project) and checks
// every answer the web app reads parses with the schema it uses.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { git, startToGate, testServer } from "../packages/server/tests/support/testServer";
import * as schemas from "../packages/web/src/api/responseSchemas";

let server: Awaited<ReturnType<typeof testServer>>;
let runId: string;
beforeAll(async () => {
  server = await testServer({ git: true });
  await writeFile(join(server.projectRoot, "discovery/requirements.md"), "# Requirements\nR1 old\n");
  await git(server.projectRoot, "add", "-A");
  await git(server.projectRoot, "commit", "-qm", "requirements");
  runId = await startToGate(server);
});
afterAll(async () => await server.cleanup());

async function answer(path: string): Promise<unknown> {
  const response = await server.app.request(path);
  expect(response.status, path).toBe(200);
  return await response.json();
}

// What `schema` finds wrong with `value`; [] when it parses.
function issues(schema: z.ZodType, value: unknown) {
  const result = schema.safeParse(value);
  return result.success ? [] : result.error.issues;
}

describe("server answers the web app reads", () => {
  it.each([
    ["/api/health", schemas.Health],
    ["/api/project", schemas.Registry],
    ["/api/phases", schemas.Phases],
    ["/api/workflows", schemas.WorkflowSummaries],
    ["/api/workflows/ba-discovery", schemas.WorkflowWithProblems],
    ["/api/runs", schemas.RunSummaries],
    ["/api/files?path=discovery/brief.md", schemas.FileContent],
  ] as const)("%s", async (path, schema) => {
    expect(issues(schema, await answer(path))).toEqual([]);
  });

  it("a run and its gate's changes", async () => {
    expect(issues(schemas.RunDetails, await answer(`/api/runs/${runId}`))).toEqual([]);
    const changes = await answer(`/api/runs/${runId}/gates/review/changes`);
    expect(issues(schemas.GateChanges, changes)).toEqual([]);
    expect(changes).toMatchObject({ files: [{ path: "discovery/requirements.md", change: "modified" }] });
  });

  it("an error answer", async () => {
    const response = await server.app.request("/api/runs/run-nope");
    expect(issues(schemas.ErrorBody, await response.json())).toEqual([]);
  });

  it("every event of a run", async () => {
    const response = await server.app.request(`/api/runs/${runId}/events`);
    const reader = response.body?.getReader();
    let text = "";
    while (reader && !text.includes("event: run-settled")) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += new TextDecoder().decode(chunk.value);
    }
    await reader?.cancel();
    const events = text
      .split("\n\n")
      .map((block) => block.split("\n").find((line) => line.startsWith("data: "))?.slice(6))
      .filter((data): data is string => data !== undefined);
    expect(events.length).toBeGreaterThan(3);
    for (const data of events) expect(issues(schemas.LogEventData, JSON.parse(data))).toEqual([]);
  });
});
