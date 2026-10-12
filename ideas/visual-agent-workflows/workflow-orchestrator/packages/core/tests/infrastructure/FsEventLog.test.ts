import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LoggedEvent } from "../../src/application/EventLog";
import { FsEventLog } from "../../src/infrastructure/FsEventLog";

let dataDir: string;
beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "orch-events-"));
});
afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

const event = (seq: number): LoggedEvent => ({ seq, at: "2026-10-11T12:00:00.000Z", event: { type: "step-started", stepId: "elicit", attempt: seq } });

describe("FsEventLog", () => {
  it("appends events and reads them back, all or after a seq, from a new instance", async () => {
    const log = new FsEventLog(dataDir);
    for (const seq of [1, 2, 3]) await log.append("run-1", event(seq));

    const again = new FsEventLog(dataDir);
    expect(await again.read("run-1")).toEqual([event(1), event(2), event(3)]);
    expect((await again.read("run-1", 2)).map((e) => e.seq)).toEqual([3]);
    expect(await again.lastSeq("run-1")).toBe(3);
  });

  it("has nothing for a run without events", async () => {
    const log = new FsEventLog(dataDir);
    expect(await log.read("run-9")).toEqual([]);
    expect(await log.lastSeq("run-9")).toBe(0);
  });

  it("refuses a run id that could escape the data folder", async () => {
    await expect(new FsEventLog(dataDir).read("../x")).rejects.toThrow("invalid run id");
  });

  it("skips a last line cut off by a crash, but not a bad line before it", async () => {
    const log = new FsEventLog(dataDir);
    await log.append("run-1", event(1));
    await appendFile(join(dataDir, "runs/run-1/events.jsonl"), '{"seq":2,"at":"x","ev');

    expect((await log.read("run-1")).map((e) => e.seq)).toEqual([1]);
    expect(await log.lastSeq("run-1")).toBe(1);

    await appendFile(join(dataDir, "runs/run-1/events.jsonl"), "\n" + JSON.stringify(event(3)) + "\n");
    await expect(log.read("run-1")).rejects.toThrow("line 2 is not an event");
  });

  it("reads an event stored with the old agent run id name", async () => {
    const record = { status: "done", cursorRunIds: ["a"], writes: [], missing: [], summary: "", durationMs: 0 };
    await mkdir(join(dataDir, "runs/run-1"), { recursive: true });
    await writeFile(join(dataDir, "runs/run-1/events.jsonl"), `${JSON.stringify({ seq: 1, at: "t", event: { type: "step-finished", stepId: "elicit", record } })}\n`);

    const [read] = await new FsEventLog(dataDir).read("run-1");

    expect(read?.event).toMatchObject({ record: { agentRunIds: ["a"] } });
  });
});
