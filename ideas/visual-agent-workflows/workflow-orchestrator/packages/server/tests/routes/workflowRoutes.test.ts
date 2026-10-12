import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { jsonBody, testServer } from "../support/testServer";

let server: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => {
  server = await testServer();
});
afterAll(async () => await server.cleanup());

type WorkflowJson = { id: string; name: string; phase?: string; steps: { agent?: string }[] };
const getWorkflow = async () => ((await (await server.app.request("/api/workflows/ba-discovery")).json()) as { workflow: WorkflowJson }).workflow;

describe("/api/workflows", () => {
  it("lists workflows with their problems", async () => {
    expect(await (await server.app.request("/api/workflows")).json()).toEqual([
      {
        id: "ba-discovery",
        name: "BA discovery",
        phase: "discovery",
        agents: ["business-analyst", "architect"],
        skills: ["requirements-elicitation", "architecture-review"],
        problems: [],
      },
      {
        id: "implement-requirement",
        name: "Implement a requirement",
        phase: "delivery",
        agents: ["developer"],
        skills: ["implement-requirement"],
        problems: [],
      },
    ]);
  });

  it("returns one workflow with its problems, 404 for an unknown one", async () => {
    const response = await server.app.request("/api/workflows/ba-discovery");
    expect(await response.json()).toMatchObject({ problems: [] });
    expect((await server.app.request("/api/workflows/nope")).status).toBe(404);
  });

  it("saves a copy, returns its problems, and deletes it", async () => {
    const copy = { ...(await getWorkflow()), id: "copy", name: "Copy", phase: "testing" };

    const saved = await server.app.request("/api/workflows/copy", jsonBody("PUT", copy));
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({
      problems: [{ severity: "warning", message: 'phase "testing" is not in phases.json; the workflow is shown under Unsorted' }],
    });
    expect((await server.app.request("/api/workflows/copy", { method: "DELETE" })).status).toBe(204);
    expect((await server.app.request("/api/workflows/copy", { method: "DELETE" })).status).toBe(404);
  });

  it("refuses a body that isn't a workflow or whose id differs", async () => {
    expect((await server.app.request("/api/workflows/copy", jsonBody("PUT", { name: "x" }))).status).toBe(400);
    const mismatch = await server.app.request("/api/workflows/other", jsonBody("PUT", await getWorkflow()));
    expect(mismatch.status).toBe(400);
    expect(await mismatch.json()).toMatchObject({ error: expect.stringMatching(/doesn't match "other"/) });
  });
});

describe("POST /api/workflows", () => {
  it("creates a workflow file and returns its problems; a second create is a conflict", async () => {
    const workflow = { ...(await getWorkflow()), id: "created", name: "Created" };

    const created = await server.app.request("/api/workflows", jsonBody("POST", { workflow }));
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ problems: [] });
    expect(await readFile(join(server.projectRoot, ".cursor/workflows/created.json"), "utf8")).toContain('"name": "Created"');

    const again = await server.app.request("/api/workflows", jsonBody("POST", { workflow }));
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: 'a workflow "created" already exists' });
    await server.app.request("/api/workflows/created", { method: "DELETE" });
  });

  it("refuses a body without a valid workflow", async () => {
    expect((await server.app.request("/api/workflows", jsonBody("POST", { workflow: { name: "x" } }))).status).toBe(400);
    expect((await server.app.request("/api/workflows", jsonBody("POST", []))).status).toBe(400);
  });
});

describe("POST /api/workflows/check", () => {
  it("returns a draft's problems and writes nothing", async () => {
    const workflow = { ...(await getWorkflow()), id: "draft", steps: (await getWorkflow()).steps.map((s, i) => (i === 0 ? { ...s, agent: "ghost" } : s)) };

    const response = await server.app.request("/api/workflows/check", jsonBody("POST", { workflow }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ problems: [{ severity: "error", stepId: "elicit", message: 'unknown agent "ghost"' }] });
    await expect(readFile(join(server.projectRoot, ".cursor/workflows/draft.json"), "utf8")).rejects.toThrow();
  });

  it("answers a broken draft with its schema problems", async () => {
    const response = await server.app.request("/api/workflows/check", jsonBody("POST", { workflow: { name: "x" } }));

    expect(response.status).toBe(200);
    const { problems } = (await response.json()) as { problems: { severity: string }[] };
    expect(problems.length).toBeGreaterThan(0);
  });
});

describe("POST /api/workflows/:id/runs", () => {
  it("answers 202 with the run id before the run settles", async () => {
    const response = await server.app.request("/api/workflows/ba-discovery/runs", jsonBody("POST", { inputs: {} }));

    expect(response.status).toBe(202);
    const { runId } = (await response.json()) as { runId: string };
    expect(runId).toMatch(/^run-[0-9a-f]{8}$/);
    await server.services.supervisor.settled(runId);
  });

  it("refuses an unknown workflow, bad inputs, and a workflow with errors", async () => {
    expect((await server.app.request("/api/workflows/nope/runs", jsonBody("POST", {}))).status).toBe(404);
    expect((await server.app.request("/api/workflows/ba-discovery/runs", jsonBody("POST", { inputs: { focus: 3 } }))).status).toBe(400);

    const broken = { ...(await getWorkflow()), id: "broken" };
    Object.assign(broken.steps[0] ?? {}, { agent: "ghost" });
    await server.app.request("/api/workflows/broken", jsonBody("PUT", broken));
    const response = await server.app.request("/api/workflows/broken/runs", jsonBody("POST", {}));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ problems: [{ severity: "error", stepId: "elicit", message: 'unknown agent "ghost"' }] });
  });

  it("answers 503 when the API key is missing", async () => {
    const real = await testServer({ fake: false });
    vi.stubEnv("CURSOR_API_KEY", "");
    try {
      const response = await real.app.request("/api/workflows/ba-discovery/runs", jsonBody("POST", {}));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "CURSOR_API_KEY is not set" });
    } finally {
      vi.unstubAllEnvs();
      await real.cleanup();
    }
  });
});
