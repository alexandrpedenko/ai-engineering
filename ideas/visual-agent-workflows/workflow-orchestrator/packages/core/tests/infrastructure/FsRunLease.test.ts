import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConflictError } from "../../src/application/errors";
import { FsRunLease } from "../../src/infrastructure/FsRunLease";

let dataDir: string;
beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "orch-lease-"));
});
afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

// A pid no process has (above the usual maximum).
const deadPid = 2 ** 22 + 12345;

describe("FsRunLease", () => {
  it("takes, reports and gives back the lease", async () => {
    const lease = new FsRunLease(dataDir);

    await lease.acquire("run-1");

    expect(await lease.holder()).toMatchObject({ pid: process.pid, runId: "run-1", mine: true, alive: true });
    await lease.release("run-1");
    expect(await lease.holder()).toBeNull();
  });

  it("lets this process take it again for the same run, not for another", async () => {
    const lease = new FsRunLease(dataDir);
    await lease.acquire("run-1");

    await expect(lease.acquire("run-1")).resolves.toBeUndefined();
    await expect(lease.acquire("run-2")).rejects.toThrow('run "run-1" is moving; one run moves at a time in a project');
  });

  it("refuses while another live process holds it", async () => {
    await new FsRunLease(dataDir, process.ppid).acquire("run-other");

    await expect(new FsRunLease(dataDir).acquire("run-1")).rejects.toBeInstanceOf(ConflictError);
    await expect(new FsRunLease(dataDir).acquire("run-1")).rejects.toThrow(`in another process (pid ${process.ppid})`);
  });

  it("takes over a lease left by a process that stopped, or a torn file", async () => {
    await new FsRunLease(dataDir, deadPid).acquire("run-dead");
    await new FsRunLease(dataDir).acquire("run-1");
    expect(JSON.parse(await readFile(join(dataDir, "project.lock"), "utf8"))).toMatchObject({ pid: process.pid, runId: "run-1" });

    await writeFile(join(dataDir, "project.lock"), "{ torn");
    await new FsRunLease(dataDir).acquire("run-2");
    expect(await new FsRunLease(dataDir).holder()).toMatchObject({ runId: "run-2" });
  });

  it("doesn't give back a lease it doesn't hold", async () => {
    await new FsRunLease(dataDir, process.ppid).acquire("run-other");
    await new FsRunLease(dataDir).release("run-other");
    expect(await new FsRunLease(dataDir).holder()).toMatchObject({ runId: "run-other" });
  });
});
