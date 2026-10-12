import type { AgentRunRequest, AgentRunResult, AgentRuntime, RunHandle } from "../../application/AgentRuntime";
import type { RuntimeKind } from "../../domain/config";
import type { AgentProvider, ProviderRun } from "./AgentProvider";

export const INTERRUPTED_SUMMARY = "the agent run was interrupted (its process stopped)";

// The AgentRuntime for any provider (ADR-0013). Keeps the API key out of error
// messages, remembers the runs it started so it can reattach to them in the
// same process, and reports a run that was cut off with its process as an
// interrupted error rather than starting it again (ADR-0006); a run is
// forgotten once its result has been read. What differs between agent SDKs lives in
// the AgentProvider.
export class ProviderAgentRuntime implements AgentRuntime {
  private readonly started = new Map<string, ProviderRun>();

  constructor(
    private readonly provider: AgentProvider,
    private readonly secret: string,
  ) {}

  get kind(): RuntimeKind {
    return this.provider.name;
  }

  async start(request: AgentRunRequest): Promise<RunHandle> {
    const run = await this.guard(async () => await this.provider.open(request));
    this.started.set(run.id, run);
    return this.handle(run);
  }

  async attach(runId: string, cwd: string): Promise<RunHandle | null> {
    const known = this.started.get(runId);
    if (known) return this.handle(known);
    const found = await this.guard(async () => await this.provider.find(runId, cwd));
    if (found === null) return null;
    if (found === "cut-off") return interruptedHandle(runId);
    return this.handle(found);
  }

  private handle(run: ProviderRun): RunHandle {
    return {
      id: run.id,
      events: () => run.events(),
      wait: async () => {
        const result = await this.guard(async () => await run.result());
        this.started.delete(run.id);
        return result;
      },
      cancel: async () => await this.guard(async () => await run.cancel()),
    };
  }

  // Runs a provider call; if it throws, the API key is removed from the message.
  private async guard<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof Error && this.secret && error.message.includes(this.secret)) {
        error.message = error.message.split(this.secret).join("[redacted]");
      }
      throw error;
    }
  }
}

// A handle for a run that stopped with its process: no events, an error result.
function interruptedHandle(runId: string): RunHandle {
  const result: AgentRunResult = { status: "error", summary: INTERRUPTED_SUMMARY, durationMs: 0 };
  return { id: runId, events: async function* () {}, wait: async () => result, cancel: async () => {} };
}
