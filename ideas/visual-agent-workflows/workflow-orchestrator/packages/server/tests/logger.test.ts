import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLogger } from "../src/logger";

const temps: string[] = [];
afterEach(async () => {
  await Promise.all(temps.splice(0).map(async (dir) => await rm(dir, { recursive: true, force: true })));
});

describe("createLogger", () => {
  it("writes JSON lines to the stream and the log file, errors with their message", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-log-"));
    temps.push(dir);
    const lines: string[] = [];
    const log = createLogger(dir, (line) => lines.push(line), () => new Date("2026-10-12T08:00:00Z"));

    log.info("server started", { port: 4317 });
    log.error("event log write failed", new Error("disk full"), { runId: "run-1" });

    expect(JSON.parse(lines[0] ?? "")).toEqual({ time: "2026-10-12T08:00:00.000Z", level: "info", message: "server started", port: 4317 });
    expect(JSON.parse(lines[1] ?? "")).toMatchObject({ level: "error", runId: "run-1", error: "disk full" });
    expect(await readFile(join(dir, "logs/server.log"), "utf8")).toBe(lines.join(""));
  });
});
