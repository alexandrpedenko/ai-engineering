import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { StepEvent } from "../../src/domain/runState";
import { FakeAgentRuntime } from "../../src/infrastructure/FakeAgentRuntime";

const request = (key: string) => ({ cwd: "/host", model: { id: "m" }, message: `msg ${key}`, key });

async function collect(events: AsyncIterable<StepEvent>) {
  const all: StepEvent[] = [];
  for await (const event of events) all.push(event);
  return all;
}

describe("FakeAgentRuntime", () => {
  it("replays replies in order and repeats the last", async () => {
    const runtime = new FakeAgentRuntime([{ summary: "one" }, { status: "error", summary: "two" }]);

    const results = [];
    for (const key of ["a", "b", "c"]) results.push(await (await runtime.start(request(key))).wait());

    expect(results.map((r) => `${r.status}:${r.summary}`)).toEqual(["finished:one", "error:two", "error:two"]);
  });

  it("gives each run its own id and replays its events", async () => {
    const runtime = new FakeAgentRuntime([{ events: [{ kind: "text", text: "hi" }] }]);

    const first = await runtime.start(request("a"));
    const second = await runtime.start(request("b"));

    expect([first.id, second.id]).toEqual(["fake-run-1", "fake-run-2"]);
    expect(await collect(first.events())).toEqual([{ kind: "text", text: "hi" }]);
  });

  it("can build replies from the request", async () => {
    const runtime = new FakeAgentRuntime((req, index) => ({ summary: `${index}:${req.key}` }));
    expect((await (await runtime.start(request("x"))).wait()).summary).toBe("0:x");
  });

  it("throws from start() when a reply says so", async () => {
    await expect(new FakeAgentRuntime([{ startFails: "no plan" }]).start(request("a"))).rejects.toThrow("no plan");
  });

  it("records requests", async () => {
    const runtime = new FakeAgentRuntime();
    await runtime.start(request("a"));

    expect(runtime.requests.map((r) => r.message)).toEqual(["msg a"]);
  });

  it("reattaches only to runs it started, with their result and no events", async () => {
    const runtime = new FakeAgentRuntime([{ summary: "s", events: [{ kind: "text", text: "hi" }] }]);
    await runtime.start(request("a"));

    const handle = await runtime.attach("fake-run-1");

    if (!handle) throw new Error("expected a handle");
    expect((await handle.wait()).summary).toBe("s");
    expect(await collect(handle.events())).toEqual([]);
    expect(await runtime.attach("other")).toBeNull();
  });

  it("reports a cut-off run as an interrupted error on attach", async () => {
    const runtime = new FakeAgentRuntime();
    await runtime.start(request("a"));
    runtime.cutOff("fake-run-1");

    expect(await (await runtime.attach("fake-run-1"))?.wait()).toMatchObject({ status: "error", summary: expect.stringContaining("interrupted") });
  });

  it("throws once from wait() when a reply dies, then answers", async () => {
    const runtime = new FakeAgentRuntime([{ dies: true }]);
    const handle = await runtime.start(request("a"));

    await expect(handle.wait()).rejects.toThrow("fake process stopped during fake-run-1");
    expect((await handle.wait()).status).toBe("finished");
  });

  it("holds wait() until cancelled, then answers cancelled", async () => {
    const runtime = new FakeAgentRuntime([{ holds: true }]);
    const handle = await runtime.start(request("a"));

    const waiting = handle.wait();
    await handle.cancel();

    expect(await waiting).toEqual({ status: "cancelled", summary: "", durationMs: 0 });
  });

  it("takes delayMs to answer, and a cancel ends the wait early", async () => {
    const runtime = new FakeAgentRuntime([{ delayMs: 30 }]);
    const started = Date.now();
    expect((await (await runtime.start(request("a"))).wait()).status).toBe("finished");
    expect(Date.now() - started).toBeGreaterThanOrEqual(25);

    const slow = new FakeAgentRuntime([{ delayMs: 60_000 }]);
    const handle = await slow.start(request("b"));
    const waiting = handle.wait();
    await handle.cancel();
    expect((await waiting).status).toBe("cancelled");
  });

  it("writes a placeholder to each plain path the message says to write", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-fake-"));
    const runtime = new FakeAgentRuntime([{ placeholders: true }]);
    const message = "# Task\nDo it.\n\n# You must write\n- discovery/req.md\n- wiki/**\n\n# Reviewer feedback on your previous attempt\n1. add checks\n";

    await runtime.start({ ...request("run-1:elicit:2"), cwd: dir, message });

    const text = await readFile(join(dir, "discovery/req.md"), "utf8");
    expect(text).toContain("Placeholder written by the fake agent (run-1:elicit:2)");
    expect(text).toContain("1. add checks");
    await rm(dir, { recursive: true, force: true });
  });

  it("writes the reply's files under cwd", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-fake-"));
    const runtime = new FakeAgentRuntime([{ writes: { "discovery/out.md": "hello" } }]);

    await runtime.start({ ...request("a"), cwd: dir });

    expect(await readFile(join(dir, "discovery/out.md"), "utf8")).toBe("hello");
    await rm(dir, { recursive: true, force: true });
  });
});
