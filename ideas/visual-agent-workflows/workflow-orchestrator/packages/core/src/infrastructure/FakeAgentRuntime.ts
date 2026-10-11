import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AgentRunRequest, AgentRunResult, AgentRuntime, RunHandle } from "../application/AgentRuntime";
import type { StepEvent, Usage } from "../domain/runState";

export type FakeReply = {
  events?: StepEvent[];
  status?: "finished" | "error";
  summary?: string;
  usage?: Usage;
  writes?: Record<string, string>; // files written under cwd when the run starts
  dies?: boolean; // wait() throws the first time, like a process that stopped mid-run
  holds?: boolean; // wait() doesn't answer until the run is cancelled
};

// An AgentRuntime that runs nothing: each start replays the next scripted
// reply (the last one repeats), or asks a function for one. Every request is
// kept in `requests`. attach() finds runs this instance started.
export class FakeAgentRuntime implements AgentRuntime {
  readonly requests: AgentRunRequest[] = [];
  private readonly started = new Map<string, { result: AgentRunResult; cutOff: boolean }>();

  constructor(private readonly replies: FakeReply[] | ((request: AgentRunRequest, index: number) => FakeReply) = [{}]) {}

  async start(request: AgentRunRequest): Promise<RunHandle> {
    const index = this.requests.length;
    this.requests.push(request);
    const reply =
      typeof this.replies === "function"
        ? this.replies(request, index)
        : (this.replies[Math.min(index, this.replies.length - 1)] ?? {});

    for (const [path, content] of Object.entries(reply.writes ?? {})) {
      await mkdir(dirname(join(request.cwd, path)), { recursive: true });
      await writeFile(join(request.cwd, path), content);
    }

    const id = `fake-run-${index + 1}`;
    const result: AgentRunResult = {
      status: reply.status ?? "finished",
      summary: reply.summary ?? `done ${request.key}`,
      durationMs: 0,
      ...(reply.usage ? { usage: reply.usage } : {}),
    };
    this.started.set(id, { result, cutOff: false });
    let dies = reply.dies ?? false;
    let release: () => void = () => {};
    let cancelled = false;
    const held = reply.holds ? new Promise<void>((resolve) => (release = resolve)) : null;
    const cancelledResult: AgentRunResult = { status: "cancelled", summary: "", durationMs: 0 };

    return {
      id,
      events: async function* () {
        for (const event of reply.events ?? []) yield event;
      },
      wait: async () => {
        if (dies) {
          dies = false;
          throw new Error(`fake process stopped during ${id}`);
        }
        if (held) await held;
        return cancelled ? cancelledResult : result;
      },
      cancel: async () => {
        cancelled = true;
        release();
      },
    };
  }

  async attach(runId: string): Promise<RunHandle | null> {
    const run = this.started.get(runId);
    if (!run) return null;
    const result: AgentRunResult = run.cutOff
      ? { status: "error", summary: "the agent run was interrupted (its process stopped)", durationMs: 0 }
      : run.result;
    return { id: runId, events: async function* () {}, wait: async () => result, cancel: async () => {} };
  }

  // Makes a started run look cut off with its process: attach() then reports an error.
  cutOff(runId: string): void {
    const run = this.started.get(runId);
    if (run) run.cutOff = true;
  }
}
