import type { AgentRunRequest, AgentRuntime, RunHandle } from "../application/AgentRuntime";
import type { StepEvent, Usage } from "../domain/runState";

export type FakeReply = { events?: StepEvent[]; status?: "finished" | "error"; summary?: string; usage?: Usage };

// An AgentRuntime that runs nothing: each start replays the next scripted
// reply (the last one repeats), or asks a function for one. Every request is
// kept in `requests`. Can't reattach to anything.
export class FakeAgentRuntime implements AgentRuntime {
  readonly requests: AgentRunRequest[] = [];

  constructor(private readonly replies: FakeReply[] | ((request: AgentRunRequest, index: number) => FakeReply) = [{}]) {}

  async start(request: AgentRunRequest): Promise<RunHandle> {
    const index = this.requests.length;
    this.requests.push(request);
    const reply =
      typeof this.replies === "function"
        ? this.replies(request, index)
        : (this.replies[Math.min(index, this.replies.length - 1)] ?? {});

    return {
      id: `fake-run-${index + 1}`,
      events: async function* () {
        for (const event of reply.events ?? []) yield event;
      },
      wait: async () => ({
        status: reply.status ?? "finished",
        summary: reply.summary ?? `done ${request.key}`,
        durationMs: 0,
        ...(reply.usage ? { usage: reply.usage } : {}),
      }),
      cancel: async () => {},
    };
  }

  async attach(): Promise<RunHandle | null> {
    return null;
  }
}
