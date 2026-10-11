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
const writeSettings = async (value: unknown) =>
  await writeFile(join(orchestrator, "settings.json"), typeof value === "string" ? value : JSON.stringify(value));

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

  it("lets overrides.runtime win, and names a runtime that doesn't exist", async () => {
    expect((await loadConfig(orchestrator, { runtime: "claude" })).runtime).toBe("claude");
    expect(await problemsOf(loadConfig(orchestrator, { runtime: "gemini" }))).toMatchObject([{ key: "runtime" }]);
  });

  it("takes projectRoot, runtime and models from settings.json over the config file", async () => {
    await mkdir(join(host, "mine"));
    await writeConfig(JSON.stringify({ projectRoot: "..", runtime: "cursor", models: { claude: "claude-opus-5-5" } }));
    await writeSettings({ projectRoot: join(host, "mine"), runtime: "claude", models: { claude: "claude-sonnet-5-5" } });

    const config = await loadConfig(orchestrator);

    expect(config.projectRoot).toBe(join(host, "mine"));
    expect(config.runtime).toBe("claude");
    expect(config.models).toEqual({ cursor: "composer-2.5", claude: "claude-sonnet-5-5" });
    expect(config.sources).toEqual({ projectRoot: "settings.json", runtime: "settings.json" });
  });

  it("lets a flag or environment override beat settings.json", async () => {
    await mkdir(join(host, "other"));
    await writeSettings({ projectRoot: "..", runtime: "claude" });

    const config = await loadConfig(orchestrator, { projectRoot: "../other", runtime: "cursor" });

    expect(config.projectRoot).toBe(join(host, "other"));
    expect(config.runtime).toBe("cursor");
    expect(config.sources).toEqual({ projectRoot: "override", runtime: "override" });
  });

  it("resolves a relative projectRoot in settings.json from the orchestrator folder", async () => {
    await mkdir(join(orchestrator, "sample"));
    await writeSettings({ projectRoot: "sample" });
    expect((await loadConfig(orchestrator)).projectRoot).toBe(join(orchestrator, "sample"));
  });

  it("says where the values came from without settings.json", async () => {
    expect((await loadConfig(orchestrator)).sources).toEqual({ projectRoot: "default", runtime: "default" });
    await writeConfig(JSON.stringify({ runtime: "claude" }));
    expect((await loadConfig(orchestrator)).sources).toEqual({ projectRoot: "default", runtime: "orchestrator.config.json" });
  });

  it("reads another settings file when told to, and none when it doesn't exist", async () => {
    await writeSettings({ runtime: "claude" });
    await writeFile(join(orchestrator, "other.json"), JSON.stringify({ runtime: "cursor" }));

    expect((await loadConfig(orchestrator, { settingsPath: "other.json" })).runtime).toBe("cursor");
    expect((await loadConfig(orchestrator, { settingsPath: "missing.json" })).sources?.runtime).toBe("default");
  });

  it("names settings.json when it is wrong", async () => {
    await writeSettings({ skillDirs: [] });
    await expect(loadConfig(orchestrator)).rejects.toThrow(/settings\.json.*skillDirs: unknown key/);

    await writeSettings("{ nope");
    await expect(loadConfig(orchestrator)).rejects.toThrow(/settings\.json/);

    await writeSettings({ projectRoot: "/does/not/exist" });
    await expect(loadConfig(orchestrator)).rejects.toThrow(/settings\.json.*projectRoot: \/does\/not\/exist is not a folder/);
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
