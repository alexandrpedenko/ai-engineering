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

  it("records requests and can't reattach", async () => {
    const runtime = new FakeAgentRuntime();
    await runtime.start(request("a"));

    expect(runtime.requests.map((r) => r.message)).toEqual(["msg a"]);
    expect(await runtime.attach()).toBeNull();
  });
});
