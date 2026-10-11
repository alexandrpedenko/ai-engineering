import { mkdir, readFile, writeFile } from "node:fs/promises";
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
    const response = await server.app.request("/api/files?path=wiki/README.md", jsonBody("PUT", { content: "# Wiki" }));
    expect(response.status).toBe(204);
    expect(await readFile(join(server.projectRoot, "wiki/README.md"), "utf8")).toBe("# Wiki");
  });

  it("opens a file in any folder of the project, with no config", async () => {
    await mkdir(join(server.projectRoot, "kb"), { recursive: true });
    await writeFile(join(server.projectRoot, "kb/a.md"), "# A");

    const response = await server.app.request("/api/files?path=kb/a.md");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ path: "kb/a.md", content: "# A" });
    expect((await server.app.request("/api/files?path=src/index.ts")).status).toBe(200);
  });

  it("refuses .env files, paths outside the project, missing files, and bad bodies", async () => {
    await writeFile(join(server.projectRoot, ".env"), "KEY=1");
    expect((await server.app.request("/api/files?path=.env")).status).toBe(400);
    expect((await server.app.request("/api/files?path=../secrets.md")).status).toBe(400);
    expect((await server.app.request("/api/files")).status).toBe(400);
    expect((await server.app.request("/api/files?path=discovery/none.md")).status).toBe(400);
    expect((await server.app.request("/api/files?path=wiki/README.md", jsonBody("PUT", { text: "x" }))).status).toBe(400);
    expect((await server.app.request("/api/files?path=wiki/README.md", { method: "PUT", body: "not json" })).status).toBe(415);
    const notJson = { method: "PUT", headers: { "content-type": "application/json" }, body: "not json" };
    expect((await server.app.request("/api/files?path=wiki/README.md", notJson)).status).toBe(400);
  });
});
