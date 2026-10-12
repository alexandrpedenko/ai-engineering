import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createServerServices } from "../../src/composition";
import { git, jsonBody, startToGate, testServer } from "../support/testServer";

let server: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => {
  server = await testServer();
});
afterAll(async () => await server.cleanup());

describe("/api/runs", () => {
  it("lists runs and shows one run", async () => {
    const runId = await startToGate(server);

    const list = (await (await server.app.request("/api/runs?workflowId=ba-discovery")).json()) as object[];
    expect(list[0]).toMatchObject({ runId, workflowId: "ba-discovery", status: "waiting", busy: false });
    expect(await (await server.app.request("/api/runs?workflowId=other")).json()).toEqual([]);

    const details = await (await server.app.request(`/api/runs/${runId}`)).json();
    expect(details).toMatchObject({ runId, inputs: { focus: "pricing" }, busy: false, outcome: { status: "waiting", gateId: "review" } });
    expect((await server.app.request("/api/runs/run-nope")).status).toBe(404);
  });

  it("resumes a waiting run with 202, and refuses what doesn't fit", async () => {
    const runId = await startToGate(server);

    expect((await server.app.request(`/api/runs/${runId}/resume`, jsonBody("POST", { decision: "maybe" }))).status).toBe(400);
    expect((await server.app.request(`/api/runs/${runId}/resume`, jsonBody("POST", { decision: "approve" }))).status).toBe(202);
    await server.services.supervisor.settled(runId);
    expect(await (await server.app.request(`/api/runs/${runId}`)).json()).toMatchObject({ outcome: { status: "finished" } });

    expect((await server.app.request(`/api/runs/${runId}/resume`, jsonBody("POST", { decision: "approve" }))).status).toBe(409);
    expect((await server.app.request(`/api/runs/${runId}/continue`, { method: "POST" })).status).toBe(409);
    expect((await server.app.request(`/api/runs/${runId}/cancel`, { method: "POST" })).status).toBe(409);
    expect((await server.app.request("/api/runs/run-nope/resume", jsonBody("POST", { decision: "approve" }))).status).toBe(404);
  });

  it("retries a failed run with 202, and refuses one that isn't failed", async () => {
    const runId = await startToGate(server);
    expect((await server.app.request(`/api/runs/${runId}/retry`, { method: "POST" })).status).toBe(409);
    expect((await server.app.request("/api/runs/run-nope/retry", { method: "POST" })).status).toBe(404);

    // Make design fail by cancelling it as soon as its agent call starts.
    expect((await server.app.request(`/api/runs/${runId}/resume`, jsonBody("POST", { decision: "approve" }))).status).toBe(202);
    await server.app.request(`/api/runs/${runId}/cancel`, { method: "POST" });
    await server.services.supervisor.settled(runId);
    expect(await (await server.app.request(`/api/runs/${runId}`)).json()).toMatchObject({ outcome: { status: "failed", stepId: "design" } });

    expect((await server.app.request(`/api/runs/${runId}/retry`, { method: "POST" })).status).toBe(202);
    await server.services.supervisor.settled(runId);
    expect(await (await server.app.request(`/api/runs/${runId}`)).json()).toMatchObject({
      outcome: { status: "finished", state: { steps: { design: { status: "done", cursorRunIds: [expect.any(String), expect.any(String)] } } } },
    });
  });

  it("keeps a waiting run across a server restart", async () => {
    const runId = await startToGate(server);

    const services = await createServerServices({ projectRoot: server.projectRoot, dataDir: server.dataDir, fake: true });
    const restarted = createApp(services);
    expect(await (await restarted.request(`/api/runs/${runId}`)).json()).toMatchObject({ outcome: { status: "waiting" } });
    expect((await restarted.request(`/api/runs/${runId}/resume`, jsonBody("POST", { decision: "approve" }))).status).toBe(202);
    await services.supervisor.settled(runId);
    expect(await (await restarted.request(`/api/runs/${runId}`)).json()).toMatchObject({ outcome: { status: "finished" } });
  });
});

describe("/api/runs/:runId/gates/:gateId/changes", () => {
  let repo: Awaited<ReturnType<typeof testServer>>;
  beforeAll(async () => {
    repo = await testServer({ git: true });
    const old = "# discovery/requirements.md\n\nR1 Members can book a room.\n";
    await writeFile(join(repo.projectRoot, "discovery/requirements.md"), old);
    await git(repo.projectRoot, "add", "discovery/requirements.md");
    await git(repo.projectRoot, "commit", "-qm", "requirements");
  });
  afterAll(async () => await repo.cleanup());

  it("shows only the lines the steps before the gate changed", async () => {
    const runId = await startToGate(repo);

    const response = await repo.app.request(`/api/runs/${runId}/gates/review/changes`);

    expect(response.status).toBe(200);
    const { files } = (await response.json()) as { files: { path: string; change: string; added: number; removed: number; diff: string }[] };
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ path: "discovery/requirements.md", change: "modified", removed: 1 });
    expect(files[0]?.diff).toMatch(/^@@ /);
    expect(files[0]?.diff).toContain("\n # discovery/requirements.md\n");
    expect(files[0]?.diff).toContain("\n-R1 Members can book a room.\n");
  });

  it("after a reject, shows what the revision changed, not the first attempt", async () => {
    const runId = await startToGate(repo);
    await repo.app.request(`/api/runs/${runId}/resume`, jsonBody("POST", { decision: "reject", feedback: "Add a cancel rule" }));
    await repo.services.supervisor.settled(runId);

    const { files } = (await (await repo.app.request(`/api/runs/${runId}/gates/review/changes`)).json()) as { files: { diff: string }[] };

    expect(files[0]?.diff).not.toContain("R1 Members can book a room.");
    expect(files[0]?.diff).toContain(`-Placeholder written by the fake agent (${runId}:elicit:1)`);
    expect(files[0]?.diff).toContain("+1. Add a cancel rule");
  });

  it("answers 404 for an unknown run or gate", async () => {
    const runId = await startToGate(repo);
    expect((await repo.app.request("/api/runs/run-nope/gates/review/changes")).status).toBe(404);
    expect((await repo.app.request(`/api/runs/${runId}/gates/nope/changes`)).status).toBe(404);
  });
});
