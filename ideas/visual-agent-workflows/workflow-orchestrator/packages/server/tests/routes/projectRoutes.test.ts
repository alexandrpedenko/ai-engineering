import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jsonBody, testServer } from "../support/testServer";

let server: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => {
  server = await testServer();
});
afterAll(async () => await server.cleanup());

describe("GET /api/project", () => {
  it("returns the registry", async () => {
    expect(await (await server.app.request("/api/project")).json()).toMatchObject({
      skills: [{ name: "architecture-review" }, { name: "requirements-elicitation" }],
      warnings: [],
    });
  });
});

describe("/api/files", () => {
  it("reads an artefact", async () => {
    const response = await server.app.request("/api/files?path=discovery/brief.md");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ path: "discovery/brief.md", content: expect.stringMatching(/^# Brief/) });
  });

  it("writes an artefact", async () => {
    const response = await server.app.request("/api/files?path=wiki/glossary.md", jsonBody("PUT", { content: "# Glossary" }));
    expect(response.status).toBe(204);
    expect(await readFile(join(server.projectRoot, "wiki/glossary.md"), "utf8")).toBe("# Glossary");
  });

  it("refuses paths outside skills, agents and artefacts, missing paths, and bad bodies", async () => {
    expect((await server.app.request("/api/files?path=src/index.ts")).status).toBe(400);
    expect((await server.app.request("/api/files?path=../secrets.md")).status).toBe(400);
    expect((await server.app.request("/api/files")).status).toBe(400);
    expect((await server.app.request("/api/files?path=discovery/none.md")).status).toBe(404);
    expect((await server.app.request("/api/files?path=wiki/x.md", jsonBody("PUT", { text: "x" }))).status).toBe(400);
    expect((await server.app.request("/api/files?path=wiki/x.md", { method: "PUT", body: "not json" })).status).toBe(400);
  });
});
