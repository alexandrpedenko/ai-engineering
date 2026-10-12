import { Agent, type AgentOptions, type GetRunOptions, type Run, type SDKAgent } from "@cursor/sdk";
import type { AgentRunRequest } from "../../../application/AgentRuntime";
import type { AgentProvider, ProviderRun } from "../AgentProvider";
import { toRunResult, toStepEvents } from "./cursorMessages";

// The two Cursor SDK calls this provider makes, so tests can replace them.
export type CursorSdk = {
  create(options: AgentOptions): Promise<SDKAgent>;
  getRun(runId: string, options: GetRunOptions): Promise<Run>;
};

const defaultSdk: CursorSdk = {
  create: async (options) => await Agent.create(options),
  getRun: async (runId, options) => await Agent.getRun(runId, options),
};

function isNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const { status, code } = error as { status?: unknown; code?: unknown };
  return status === 404 || (typeof code === "string" && /not.?found/i.test(code)) || /not.?found/i.test(error.message);
}

// The only built-in tools a Cursor agent step gets: no shell, MCP, web or
// subagents (ADR-0017).
export const CURSOR_TOOLS = ["read", "edit", "delete", "grep", "glob", "ls"];

// Cursor's local agents: the agent works in the project with the project's own
// .cursor settings (rules, skills), with the tools in CURSOR_TOOLS. Local runs
// live inside this process, so one found again after a restart that was still
// running was cut off.
export class CursorProvider implements AgentProvider {
  readonly name = "cursor" as const;
  private readonly apiKey: string;
  private readonly sdk: CursorSdk;

  constructor(options: { apiKey: string; sdk?: CursorSdk }) {
    this.apiKey = options.apiKey;
    this.sdk = options.sdk ?? defaultSdk;
  }

  async open(request: AgentRunRequest): Promise<ProviderRun> {
    const agent = await this.sdk.create({
      apiKey: this.apiKey,
      model: request.model,
      local: { cwd: request.cwd, settingSources: ["project"] },
      tools: CURSOR_TOOLS,
    });
    let run: Run;
    try {
      run = await agent.send(request.message, { idempotencyKey: request.key });
    } catch (error) {
      agent.close();
      throw error;
    }
    return {
      id: run.id,
      events: async function* () {
        for await (const message of run.stream()) yield* toStepEvents(message);
      },
      result: async () => {
        try {
          return toRunResult(await run.wait());
        } finally {
          agent.close();
        }
      },
      cancel: async () => await run.cancel(),
    };
  }

  async find(runId: string, cwd: string): Promise<ProviderRun | "cut-off" | null> {
    let run: Run;
    try {
      run = await this.sdk.getRun(runId, { runtime: "local", cwd });
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
    if (run.status === "running") return "cut-off";
    return {
      id: run.id,
      events: async function* () {},
      result: async () => toRunResult(await run.wait()),
      cancel: async () => await run.cancel(),
    };
  }
}
