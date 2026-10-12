import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jsonBody, startToGate, testServer } from "../support/testServer";

let server: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => {
  server = await testServer();
});
afterAll(async () => await server.cleanup());

describe("GET /api/project", () => {
  it("returns the registry", async () => {
    expect(await (await server.app.request("/api/project")).json()).toMatchObject({
      skills: [{ name: "architecture-review" }, { name: "implement-requirement" }, { name: "requirements-elicitation" }],
      warnings: [],
    });
  });
});

describe("/api/files", () => {
  it("reads an artefact", async () => {
    const response = await server.app.request("/api/files?path=discovery/brief.md");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      path: "discovery/brief.md",
      content: expect.stringMatching(/^# Brief/),
      version: expect.stringMatching(/^[0-9a-f]{40}$/),
    });
  });

  it("writes an artefact and answers with its new version", async () => {
    const response = await server.app.request("/api/files?path=wiki/README.md", jsonBody("PUT", { content: "# Wiki" }));
    expect(response.status).toBe(200);
    const { version } = (await response.json()) as { version: string };
    expect(await readFile(join(server.projectRoot, "wiki/README.md"), "utf8")).toBe("# Wiki");
    expect(await (await server.app.request("/api/files?path=wiki/README.md")).json()).toMatchObject({ version });
  });

  it("refuses a write based on an old version (409 with the current one), and accepts one based on the current", async () => {
    const read = async () => (await (await server.app.request("/api/files?path=wiki/README.md")).json()) as { version: string };
    const opened = await read();
    await writeFile(join(server.projectRoot, "wiki/README.md"), "# Changed in the IDE");
    const current = await read();

    const stale = await server.app.request("/api/files?path=wiki/README.md", jsonBody("PUT", { content: "mine", baseVersion: opened.version }));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: '"wiki/README.md" changed on disk since it was opened', version: current.version });
    expect(await readFile(join(server.projectRoot, "wiki/README.md"), "utf8")).toBe("# Changed in the IDE");

    const fresh = await server.app.request("/api/files?path=wiki/README.md", jsonBody("PUT", { content: "mine", baseVersion: current.version }));
    expect(fresh.status).toBe(200);
  });

  it("opens a file in any folder of the project, with no config", async () => {
    await mkdir(join(server.projectRoot, "kb"), { recursive: true });
    await writeFile(join(server.projectRoot, "kb/a.md"), "# A");

    const response = await server.app.request("/api/files?path=kb/a.md");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ path: "kb/a.md", content: "# A" });
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

describe("an edited skill reaches the next run", () => {
  it("puts a skill saved through /api/files into the next step's message", async () => {
    const path = ".cursor/skills/requirements-elicitation/SKILL.md";
    const { content } = (await (await server.app.request(`/api/files?path=${path}`)).json()) as { content: string };
    await server.app.request(`/api/files?path=${path}`, jsonBody("PUT", { content: `${content}\nMark each requirement with a priority.\n` }));

    await startToGate(server);

    const written = await readFile(join(server.projectRoot, "discovery/requirements.md"), "utf8");
    expect(written).toContain("> Mark each requirement with a priority.");
  });
});
