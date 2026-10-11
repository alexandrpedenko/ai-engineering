import { rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { InvalidInputError } from "../../src/application/errors";
import { OrchestratorConfig, type ResolvedConfig } from "../../src/domain/config";
import { FsWorkflowStore } from "../../src/infrastructure/FsWorkflowStore";
import { copyOfSampleProject, orchestratorDir, sampleProject } from "../support/paths";

const configFor = (projectRoot: string): ResolvedConfig => ({
  ...OrchestratorConfig.parse({}),
  orchestratorDir,
  projectRoot,
  dataDir: join(orchestratorDir, ".data"),
});

const temps: string[] = [];
afterEach(async () => {
  await Promise.all(temps.splice(0).map(async (dir) => await rm(dir, { recursive: true, force: true })));
});

describe("FsWorkflowStore", () => {
  it("loads the sample project's workflow with defaults filled", async () => {
    const workflow = await new FsWorkflowStore(configFor(sampleProject)).get("ba-discovery");

    expect(workflow?.steps.map((s) => s.id)).toEqual(["elicit", "review", "design"]);
    expect(workflow?.phase).toBe("discovery");
  });

  it("returns null for a workflow that doesn't exist or an id that isn't one", async () => {
    const store = new FsWorkflowStore(configFor(sampleProject));
    expect(await store.get("nope")).toBeNull();
    expect(await store.get("../secrets")).toBeNull();
  });

  it("names the file when it isn't valid JSON or isn't a workflow", async () => {
    const root = await copyOfSampleProject();
    temps.push(root);
    const dir = join(root, ".cursor/workflows");
    await writeFile(join(dir, "broken.json"), "{ nope");
    await writeFile(join(dir, "odd.json"), JSON.stringify({ schema: 1, id: "odd", name: "Odd", steps: [] }));
    const store = new FsWorkflowStore(configFor(root));

    await expect(store.get("broken")).rejects.toThrow(/broken\.json is not valid JSON/);
    await expect(store.get("odd")).rejects.toBeInstanceOf(InvalidInputError);
    await expect(store.get("odd")).rejects.toThrow(/odd\.json is not a valid workflow: steps:/);
  });

  it("reads phases.json, or falls back to the defaults", async () => {
    expect((await new FsWorkflowStore(configFor(sampleProject)).phases())[0]?.description).toBe("Understand the problem before building.");

    const root = await copyOfSampleProject();
    temps.push(root);
    await unlink(join(root, ".cursor/workflows/phases.json"));
    expect((await new FsWorkflowStore(configFor(root)).phases()).map((p) => p.id)).toEqual(["discovery", "delivery"]);
  });
});
