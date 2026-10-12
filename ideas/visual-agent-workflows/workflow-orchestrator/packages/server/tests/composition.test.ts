import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectServices, createRunServices, createServerServices, doNotTouchFor, orchestratorDir } from "../src/composition";

const temps: string[] = [];
afterEach(async () => {
  await Promise.all(temps.splice(0).map(async (dir) => await rm(dir, { recursive: true, force: true })));
});

async function tempCopyOfSample() {
  const dir = await mkdtemp(join(tmpdir(), "orch-composition-"));
  temps.push(dir);
  await cp(join(orchestratorDir, "fixtures/sample-project"), join(dir, "host"), { recursive: true });
  return { projectRoot: join(dir, "host"), dataDir: join(dir, "data") };
}

describe("createProjectServices", () => {
  it("scans the sample project on the real file system", async () => {
    const services = await createProjectServices({ projectRoot: "fixtures/sample-project" });

    const registry = await services.scan();

    expect(registry.root).toBe(services.config.projectRoot);
    expect(registry.skills.map((s) => s.name)).toEqual(["architecture-review", "implement-requirement", "requirements-elicitation"]);
    expect(registry.agents.map((a) => a.name)).toEqual(["architect", "business-analyst", "developer"]);
    expect(registry.agents[0]?.model).toBe("inherit");
    expect(registry.artefacts.map((a) => a.path)).toEqual(["discovery/brief.md", "wiki/README.md"]);
    expect(registry.warnings).toEqual([]);
  });
});

describe("createRunServices", () => {
  it("runs the sample workflow on the fake agent, and a second instance (a new process) finishes it", async () => {
    const paths = await tempCopyOfSample();

    const first = await createRunServices({ ...paths, fake: true });
    const { runId, outcome } = await first.start("ba-discovery", { focus: "pricing" });
    expect(outcome).toMatchObject({ status: "waiting", gateId: "review" });

    const second = await createRunServices({ ...paths, fake: true });
    expect(await second.outcome(runId)).toMatchObject({ status: "waiting", gateId: "review" });
    const done = await second.resume(runId, { decision: "approve" });

    expect(done.status).toBe("finished");
    expect(Object.keys(done.state.steps)).toEqual(["elicit", "design"]);
  });

  it("refuses to start without an API key when not fake", async () => {
    const paths = await tempCopyOfSample();
    vi.stubEnv("CURSOR_API_KEY", "");
    try {
      await expect(createRunServices({ ...paths, fake: false })).rejects.toThrow("CURSOR_API_KEY is not set");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("asks for the key of the configured runtime", async () => {
    const paths = await tempCopyOfSample();
    vi.stubEnv("ORCH_RUNTIME", "claude");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    try {
      await expect(createRunServices({ ...paths, fake: false })).rejects.toThrow("ANTHROPIC_API_KEY is not set");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("reports which runtime the server uses", async () => {
    const paths = await tempCopyOfSample();
    vi.stubEnv("ORCH_RUNTIME", "claude");
    try {
      expect((await createServerServices({ ...paths, fake: false })).runtimeName).toBe("claude");
      expect((await createServerServices({ ...paths, fake: true })).runtimeName).toBe("fake");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("refuses an unknown workflow", async () => {
    const services = await createRunServices({ ...(await tempCopyOfSample()), fake: true });
    await expect(services.start("nope", {})).rejects.toThrow(/no workflow "nope"/);
  });
});

describe("environment and wiring", () => {
  it("never reads the developer's .env in tests", () => {
    expect(process.env.ORCH_ENV_FILE).toMatch(/no-such\.env$/);
    expect(existsSync(process.env.ORCH_ENV_FILE ?? "")).toBe(false);
  });

  it("loads the .env file ORCH_ENV_FILE names", async () => {
    const paths = await tempCopyOfSample();
    const envFile = join(paths.dataDir, "..", "test.env");
    await writeFile(envFile, "ORCH_TEST_MARK=loaded\n");
    vi.stubEnv("ORCH_ENV_FILE", envFile);
    try {
      await createServerServices({ ...paths, fake: true });
      expect(process.env.ORCH_TEST_MARK).toBe("loaded");
    } finally {
      vi.unstubAllEnvs();
      delete process.env.ORCH_TEST_MARK;
    }
  });

  it("keeps agents out of the orchestrator folder only when it is inside the project", () => {
    expect(doNotTouchFor("/code/app", "/code/app/workflow-orchestrator")).toEqual(["workflow-orchestrator/"]);
    expect(doNotTouchFor("/code/app", "/code/app/tools/orch")).toEqual(["tools/orch/"]);
    expect(doNotTouchFor("/code/app", "/code/orch")).toEqual([]);
  });

  it("answers 503 on resume, continue and retry without an API key", async () => {
    const paths = await tempCopyOfSample();
    vi.stubEnv("CURSOR_API_KEY", "");
    try {
      const services = await createServerServices({ ...paths, fake: false });
      await expect(services.supervisor.resume("run-1", { decision: "approve" })).rejects.toThrow("CURSOR_API_KEY is not set");
      await expect(services.supervisor.continue("run-1")).rejects.toThrow("CURSOR_API_KEY is not set");
      await expect(services.supervisor.retry("run-1")).rejects.toThrow("CURSOR_API_KEY is not set");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("gives a CLI run an event log the server can replay", async () => {
    const paths = await tempCopyOfSample();
    const printed: string[] = [];
    const cli = await createRunServices({ ...paths, fake: true, onEvent: (_, event) => printed.push(event.type) });
    const { runId } = await cli.start("ba-discovery", {});

    const server = await createServerServices({ ...paths, fake: true });
    const seen: string[] = [];
    const stop = await server.supervisor.watch(runId, 0, (event) => seen.push(event.event.type));
    stop();

    expect(printed).toEqual(["step-started", "agent-event", "agent-event", "step-finished", "gate-waiting"]);
    expect(seen).toEqual([...printed, "run-settled"]);
  });

  it("deletes a run from the CLI", async () => {
    const paths = await tempCopyOfSample();
    const cli = await createRunServices({ ...paths, fake: true });
    const { runId } = await cli.start("ba-discovery", {});

    await cli.delete(runId);

    await expect(cli.outcome(runId)).rejects.toThrow(`no run "${runId}"`);
  });
});

