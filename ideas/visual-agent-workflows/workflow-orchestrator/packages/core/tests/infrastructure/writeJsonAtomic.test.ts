import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeJsonAtomic } from "../../src/infrastructure/writeJsonAtomic";

const temps: string[] = [];
afterEach(async () => {
  await Promise.all(temps.splice(0).map(async (dir) => await rm(dir, { recursive: true, force: true })));
});

describe("writeJsonAtomic", () => {
  it("writes indented JSON, creating folders, and leaves no temporary file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-json-"));
    temps.push(dir);

    await writeJsonAtomic(join(dir, "a/b.json"), { x: 1 });
    await writeJsonAtomic(join(dir, "a/b.json"), { x: 2 });

    expect(JSON.parse(await readFile(join(dir, "a/b.json"), "utf8"))).toEqual({ x: 2 });
    expect(await readdir(join(dir, "a"))).toEqual(["b.json"]);
  });
});
