import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpOrchestratorApi } from "../../src/api/HttpOrchestratorApi";
import { ApiError } from "../../src/domain/apiError";
import { registry, waitingRun, workflow } from "../support/sampleData";

type Call = { url: string; method: string; body?: string; headers?: unknown };

// Answers every fetch with `status` and `body`, recording the calls.
function respondWith(status: number, body?: unknown) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", ...(init?.body ? { body: String(init.body) } : {}), headers: init?.headers });
      return new Response(body === undefined ? null : JSON.stringify(body), { status });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpOrchestratorApi reads", () => {
  it("isServerUp calls /api/health and reads ok; false on a non-2xx answer", async () => {
    respondWith(200, { ok: true, node: "v25" });
    expect(await new HttpOrchestratorApi("http://srv").isServerUp()).toBe(true);
    respondWith(503, {});
    expect(await new HttpOrchestratorApi().isServerUp()).toBe(false);
  });

  it("gets each resource from its URL", async () => {
    const api = new HttpOrchestratorApi();
    const cases: [() => Promise<unknown>, string, unknown][] = [
      [() => api.project(), "/api/project", registry],
      [() => api.phases(), "/api/phases", { phases: [{ id: "d", name: "D", order: 1 }] }],
      [() => api.workflows(), "/api/workflows", [{ id: "w", name: "W", problems: [] }]],
      [() => api.workflow("ba-discovery"), "/api/workflows/ba-discovery", { workflow, problems: [] }],
      [() => api.runs("ba-discovery"), "/api/runs?workflowId=ba-discovery", []],
      [() => api.runs(), "/api/runs", []],
      [() => api.run("run-1"), "/api/runs/run-1", waitingRun()],
      [() => api.file("discovery/a b.md"), "/api/files?path=discovery%2Fa%20b.md", { path: "discovery/a b.md", content: "x" }],
    ];
    for (const [call, url, body] of cases) {
      const calls = respondWith(200, body);
      await call();
      expect(calls).toEqual([{ url, method: "GET", headers: undefined }]);
    }
  });

  it("returns phases unwrapped", async () => {
    respondWith(200, { phases: [{ id: "d", name: "D", order: 1 }] });
    expect(await new HttpOrchestratorApi().phases()).toEqual([{ id: "d", name: "D", order: 1 }]);
  });

  it("rejects an answer that doesn't have the expected shape", async () => {
    respondWith(200, { skills: "nope" });
    await expect(new HttpOrchestratorApi().project()).rejects.toThrow();
  });
});

describe("HttpOrchestratorApi actions", () => {
  it("starts a run with its inputs and returns the run id", async () => {
    const calls = respondWith(202, { runId: "run-9" });

    expect(await new HttpOrchestratorApi().startRun("ba-discovery", { focus: "x" })).toEqual({ runId: "run-9" });
    expect(calls[0]).toMatchObject({ url: "/api/workflows/ba-discovery/runs", method: "POST", body: '{"inputs":{"focus":"x"}}' });
  });

  it("posts resume, continue and cancel", async () => {
    const calls = respondWith(202);
    const api = new HttpOrchestratorApi();

    await api.resume("run-1", { decision: "reject", feedback: "more" });
    await api.continueRun("run-1");
    await api.cancel("run-1");

    expect(calls.map((c) => `${c.method} ${c.url} ${c.body ?? ""}`)).toEqual([
      'POST /api/runs/run-1/resume {"decision":"reject","feedback":"more"}',
      "POST /api/runs/run-1/continue ",
      "POST /api/runs/run-1/cancel ",
    ]);
  });

  it("turns an error answer into an ApiError with the server's message and problems", async () => {
    const problems = [{ severity: "error", stepId: "elicit", message: 'unknown agent "ghost"' }];
    respondWith(400, { error: "workflow can't run", problems });

    let error: unknown;
    try {
      await new HttpOrchestratorApi().startRun("x", {});
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, message: "workflow can't run", problems });
  });
});

// An EventSource stand-in: records listeners, lets the test send messages.
class FakeEventSource {
  static last: FakeEventSource | null = null;
  readonly listeners = new Map<string, (message: MessageEvent) => void>();
  closed = false;
  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, listener: (message: MessageEvent) => void) {
    this.listeners.set(type, listener);
  }
  close() {
    this.closed = true;
  }
  send(type: string, id: number, data: unknown) {
    this.listeners.get(type)?.(new MessageEvent(type, { data: JSON.stringify(data), lastEventId: String(id) }));
  }
}

describe("HttpOrchestratorApi.watchRun", () => {
  it("opens the run's stream after `after`, passes on each event type, and closes on stop", () => {
    const api = new HttpOrchestratorApi("", (url) => new FakeEventSource(url));
    const seen: unknown[] = [];

    const stop = api.watchRun("run-1", 4, (event) => seen.push(event));
    const source = FakeEventSource.last;
    if (!source) throw new Error("no event source");
    source.send("step-started", 5, { type: "step-started", stepId: "design", attempt: 1 });
    source.send("run-settled", 6, { type: "run-settled", outcome: { status: "finished", state: {} } });
    stop();

    expect(source.url).toBe("/api/runs/run-1/events?after=4");
    expect([...source.listeners.keys()]).toEqual(["step-started", "agent-event", "step-finished", "gate-waiting", "run-settled", "run-crashed"]);
    expect(seen).toEqual([
      { seq: 5, at: "", event: { type: "step-started", stepId: "design", attempt: 1 } },
      { seq: 6, at: "", event: { type: "run-settled", outcome: { status: "finished", state: {} } } },
    ]);
    expect(source.closed).toBe(true);
  });
});
