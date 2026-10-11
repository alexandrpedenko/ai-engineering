import { Agent, type AgentOptions, type GetRunOptions, type Run, type SDKAgent } from "@cursor/sdk";
import type { AgentRunRequest, AgentRuntime, RunHandle } from "../application/AgentRuntime";
import { toRunResult, toStepEvents } from "./cursorMessages";

// The two SDK calls this runtime makes, so tests can replace them.
export type CursorSdk = {
  create(options: AgentOptions): Promise<SDKAgent>;
  getRun(runId: string, options: GetRunOptions): Promise<Run>;
};

const defaultSdk: CursorSdk = {
  create: async (options) => await Agent.create(options),
  getRun: async (runId, options) => await Agent.getRun(runId, options),
};

const INTERRUPTED = "the agent run was interrupted (its process stopped)";

function isNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const { status, code } = error as { status?: unknown; code?: unknown };
  return status === 404 || (typeof code === "string" && /not.?found/i.test(code)) || /not.?found/i.test(error.message);
}

// AgentRuntime on Cursor's local agents: the agent works in the host project
// with the project's own .cursor settings (rules, skills, subagents, MCP).
// Local runs live inside this process; one found again after a restart that
// was still running was cut off with its process.
export class CursorAgentRuntime implements AgentRuntime {
  private readonly apiKey: string;
  private readonly sdk: CursorSdk;

  constructor(options: { apiKey: string; sdk?: CursorSdk }) {
    this.apiKey = options.apiKey;
    this.sdk = options.sdk ?? defaultSdk;
  }

  async start(request: AgentRunRequest): Promise<RunHandle> {
    const agent = await this.withoutKey(async () =>
      await this.sdk.create({
        apiKey: this.apiKey,
        model: request.model,
        local: { cwd: request.cwd, settingSources: ["project"] },
      }),
    );
    const run = await this.withoutKey(async () => await agent.send(request.message, { idempotencyKey: request.key }));
    return {
      id: run.id,
      events: async function* () {
        for await (const message of run.stream()) yield* toStepEvents(message);
      },
      wait: async () => {
        try {
          return toRunResult(await run.wait());
        } finally {
          agent.close();
        }
      },
      cancel: async () => await run.cancel(),
    };
  }

  async attach(runId: string, cwd: string): Promise<RunHandle | null> {
    let run: Run;
    try {
      run = await this.withoutKey(async () => await this.sdk.getRun(runId, { runtime: "local", cwd }));
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
    return {
      id: run.id,
      events: async function* () {},
      wait: async () =>
        run.status === "running" ? { status: "error", summary: INTERRUPTED, durationMs: 0 } : toRunResult(await run.wait()),
      cancel: async () => await run.cancel(),
    };
  }

  // Runs an SDK call; if it throws, the API key is removed from the message.
  private async withoutKey<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof Error && this.apiKey && error.message.includes(this.apiKey)) {
        error.message = error.message.split(this.apiKey).join("[redacted]");
      }
      throw error;
    }
  }
}
