import { readFile, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConflictError, InvalidInputError, NotFoundError } from "../../src/application/errors";
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

  it("lists every workflow file, a broken one with its error", async () => {
    const root = await copyOfSampleProject();
    temps.push(root);
    await writeFile(join(root, ".cursor/workflows/broken.json"), "{ nope");

    const entries = await new FsWorkflowStore(configFor(root)).list();

    expect(entries.map((e) => e.id)).toEqual(["ba-discovery", "broken"]);
    expect(entries[0]?.workflow?.name).toBe("BA discovery");
    expect(entries[1]).toMatchObject({ workflow: null, error: expect.stringMatching(/not valid JSON/) });
  });

  it("saves a workflow as readable JSON, gets it back, and removes it", async () => {
    const root = await copyOfSampleProject();
    temps.push(root);
    const store = new FsWorkflowStore(configFor(root));
    const workflow = await store.get("ba-discovery");
    if (!workflow) throw new Error("fixture workflow missing");

    await store.save({ ...workflow, id: "copy", name: "Copy" });
    const text = await readFile(join(root, ".cursor/workflows/copy.json"), "utf8");
    expect(text.startsWith('{\n  "schema": 1,')).toBe(true);
    expect(text.endsWith("}\n")).toBe(true);
    expect((await store.get("copy"))?.name).toBe("Copy");

    await store.remove("copy");
    expect(await store.get("copy")).toBeNull();
    await expect(store.remove("copy")).rejects.toBeInstanceOf(NotFoundError);
    await expect(store.remove("../x")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("creates a workflow file, and refuses an id that has a file, readable or not, leaving it as it was", async () => {
    const root = await copyOfSampleProject();
    temps.push(root);
    const store = new FsWorkflowStore(configFor(root));
    const workflow = await store.get("ba-discovery");
    if (!workflow) throw new Error("fixture workflow missing");
    await writeFile(join(root, ".cursor/workflows/broken.json"), "not json");

    await store.create({ ...workflow, id: "fresh", name: "Fresh" });
    expect((await store.get("fresh"))?.name).toBe("Fresh");
    await expect(store.create({ ...workflow, name: "Other" })).rejects.toBeInstanceOf(ConflictError);
    await expect(store.create({ ...workflow, id: "broken" })).rejects.toThrow('a workflow "broken" already exists');
    expect((await store.get("ba-discovery"))?.name).toBe("BA discovery");
    expect(await readFile(join(root, ".cursor/workflows/broken.json"), "utf8")).toBe("not json");
  });

  it("saves phases", async () => {
    const root = await copyOfSampleProject();
    temps.push(root);
    const store = new FsWorkflowStore(configFor(root));

    await store.savePhases([{ id: "build", name: "Build", order: 1 }]);

    expect(await store.phases()).toEqual([{ id: "build", name: "Build", order: 1 }]);
  });
});
