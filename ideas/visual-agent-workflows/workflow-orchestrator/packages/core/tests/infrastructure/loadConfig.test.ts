import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InvalidConfigError } from "../../src/application/errors";
import { loadConfig } from "../../src/infrastructure/loadConfig";

// A temp "host" folder with an "orchestrator" folder inside it, like a real drop-in.
let host: string;
let orchestrator: string;

beforeEach(async () => {
  host = await mkdtemp(join(tmpdir(), "orch-host-"));
  orchestrator = join(host, "workflow-orchestrator");
  await mkdir(orchestrator);
});

afterEach(async () => {
  await rm(host, { recursive: true, force: true });
});

const writeConfig = async (text: string) => await writeFile(join(orchestrator, "orchestrator.config.json"), text);

async function problemsOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof InvalidConfigError) return error.problems;
    throw error;
  }
  throw new Error("expected InvalidConfigError");
}

describe("loadConfig", () => {
  it("uses the defaults when there is no config file, with the parent as project", async () => {
    const config = await loadConfig(orchestrator);

    expect(config.projectRoot).toBe(host);
    expect(config.dataDir).toBe(join(orchestrator, ".data"));
    expect(config.skillDirs).toEqual([".cursor/skills", ".agents/skills"]);
  });

  it("resolves relative paths against the orchestrator folder, not the current directory", async () => {
    await mkdir(join(orchestrator, "sample"));
    await writeConfig(JSON.stringify({ projectRoot: "sample", dataDir: "state" }));

    const config = await loadConfig(orchestrator);

    expect(config.projectRoot).toBe(join(orchestrator, "sample"));
    expect(config.dataDir).toBe(join(orchestrator, "state"));
  });

  it("lets overrides.projectRoot win over the file", async () => {
    await mkdir(join(host, "other"));
    await writeConfig(JSON.stringify({ projectRoot: ".." }));

    const config = await loadConfig(orchestrator, { projectRoot: "../other" });

    expect(config.projectRoot).toBe(join(host, "other"));
  });

  it("lets overrides.dataDir win over the file", async () => {
    const config = await loadConfig(orchestrator, { dataDir: "/tmp/elsewhere" });
    expect(config.dataDir).toBe("/tmp/elsewhere");
  });

  it("rejects invalid JSON", async () => {
    await writeConfig("{ nope");
    expect(await problemsOf(loadConfig(orchestrator))).toMatchObject([{ key: "(file)" }]);
  });

  it("names an unknown key", async () => {
    await writeConfig(JSON.stringify({ skilDirs: [] }));
    expect(await problemsOf(loadConfig(orchestrator))).toEqual([{ key: "skilDirs", message: "unknown key" }]);
  });

  it("names a key with the wrong type", async () => {
    await writeConfig(JSON.stringify({ agentDirs: "x" }));
    expect(await problemsOf(loadConfig(orchestrator))).toMatchObject([{ key: "agentDirs" }]);
  });

  it("rejects a project root that does not exist", async () => {
    const problems = await problemsOf(loadConfig(orchestrator, { projectRoot: "nowhere" }));
    expect(problems).toMatchObject([{ key: "projectRoot", message: expect.stringMatching(/is not a folder$/) }]);
  });
});
