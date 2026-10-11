import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createServerServices } from "../../src/composition";
import { jsonBody, startToGate, testServer } from "../support/testServer";

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
