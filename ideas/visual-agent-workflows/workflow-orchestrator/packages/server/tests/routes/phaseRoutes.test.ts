import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jsonBody, testServer } from "../support/testServer";

let server: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => {
  server = await testServer();
});
afterAll(async () => await server.cleanup());

describe("/api/phases", () => {
  it("returns the project's phases", async () => {
    expect(await (await server.app.request("/api/phases")).json()).toMatchObject({ phases: [{ id: "discovery" }, { id: "delivery" }] });
  });

  it("saves phases, and refuses repeated ids", async () => {
    const phases = [{ id: "discovery", name: "Discovery", order: 1 }, { id: "knowledge", name: "Knowledge base", order: 2 }];

    expect((await server.app.request("/api/phases", jsonBody("PUT", { phases }))).status).toBe(204);
    expect(await (await server.app.request("/api/phases")).json()).toEqual({ phases });

    const repeated = await server.app.request("/api/phases", jsonBody("PUT", { phases: [phases[0], phases[0]] }));
    expect(repeated.status).toBe(400);
    expect(await repeated.json()).toMatchObject({ error: expect.stringMatching(/unique/) });
  });
});
