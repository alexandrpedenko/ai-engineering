import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectServices, createRunServices, createServerServices, orchestratorDir } from "../src/composition";

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
