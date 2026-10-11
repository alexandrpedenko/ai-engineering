import { randomUUID } from "node:crypto";
import { type Options, query as sdkQuery, type SDKMessage, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentRunRequest, AgentRunResult } from "../../../application/AgentRuntime";
import type { StepEvent } from "../../../domain/runState";
import type { AgentProvider, ProviderRun } from "../AgentProvider";
import { AsyncQueue } from "../AsyncQueue";
import { ClaudeEventMapper } from "./ClaudeEventMapper";

// The one Claude Agent SDK call this provider makes, so tests can replace it.
export type ClaudeQuery = (params: { prompt: string; options: Options }) => AsyncIterable<SDKMessage>;

const defaultQuery: ClaudeQuery = (params) => sdkQuery(params);

// Tools an agent step may use without a person approving them. No shell
// (Bash) until delivery steps need it.
const ALLOWED_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep", "Skill", "Task"];
const DISALLOWED_TOOLS = ["Bash"];

// Claude Code through the Claude Agent SDK: works in the project with Claude
// Code's own system prompt and the project's .claude settings; the project's
// agent files are passed in as subagents. Runs live inside this process, so
// one from an earlier process is always reported as cut off (ADR-0013).
export class ClaudeProvider implements AgentProvider {
  readonly name = "claude" as const;
  private readonly apiKey: string;
  private readonly query: ClaudeQuery;

  constructor(options: { apiKey: string; query?: ClaudeQuery }) {
    this.apiKey = options.apiKey;
    this.query = options.query ?? defaultQuery;
  }

  async open(request: AgentRunRequest): Promise<ProviderRun> {
    const abort = new AbortController();
    const sessionId = randomUUID();
    const options: Options = {
      cwd: request.cwd,
      model: request.model.id,
      systemPrompt: { type: "preset", preset: "claude_code" },
      settingSources: ["project"],
      permissionMode: "acceptEdits",
      allowedTools: ALLOWED_TOOLS,
      disallowedTools: DISALLOWED_TOOLS,
      sessionId,
      abortController: abort,
      env: { ...process.env, ANTHROPIC_API_KEY: this.apiKey },
      agents: Object.fromEntries(
        (request.subagents ?? []).map((agent) => [agent.name, { description: agent.description || agent.name, prompt: agent.prompt }]),
      ),
    };
    const run = new ClaudeRun(sessionId, this.query({ prompt: request.message, options }), abort);
    await run.started;
    return run;
  }

  async find(): Promise<"cut-off"> {
    return "cut-off";
  }
}

// One Claude run. Reads the SDK stream once, in the background: events go to
// a queue for events(), the result message is kept for result(). `started`
// settles when Claude reports it has started, or with the error that stopped it.
class ClaudeRun implements ProviderRun {
  readonly started: Promise<void>;
  private readonly queue = new AsyncQueue<StepEvent>();
  private readonly mapper = new ClaudeEventMapper();
  private readonly finished: Promise<AgentRunResult>;
  private cancelled = false;

  constructor(
    readonly id: string,
    stream: AsyncIterable<SDKMessage>,
    private readonly abort: AbortController,
  ) {
    let markStarted: () => void = () => {};
    let failStart: (error: unknown) => void = () => {};
    this.started = new Promise<void>((resolve, reject) => {
      markStarted = resolve;
      failStart = reject;
    });
    this.finished = this.read(stream, markStarted, failStart);
  }

  events(): AsyncIterable<StepEvent> {
    return this.queue;
  }

  async result(): Promise<AgentRunResult> {
    return await this.finished;
  }

  async cancel(): Promise<void> {
    this.cancelled = true;
    this.abort.abort();
  }

  private async read(stream: AsyncIterable<SDKMessage>, markStarted: () => void, failStart: (error: unknown) => void): Promise<AgentRunResult> {
    const startedAt = Date.now();
    let begun = false;
    let last: SDKResultMessage | null = null;
    try {
      for await (const message of stream) {
        if (message.type === "system" && message.subtype === "init") {
          begun = true;
          markStarted();
        } else if (message.type === "result") {
          last = message;
        } else {
          for (const event of this.mapper.map(message)) this.queue.push(event);
        }
      }
    } catch (error) {
      this.queue.end();
      const durationMs = Date.now() - startedAt;
      if (this.cancelled) return { status: "cancelled", summary: "cancelled", durationMs };
      if (!begun) failStart(error);
      return { status: "error", summary: error instanceof Error ? error.message : String(error), durationMs };
    }
    this.queue.end();
    if (!begun) failStart(new Error(last ? ClaudeEventMapper.toRunResult(last).summary : "Claude stopped before starting"));
    if (this.cancelled) return { status: "cancelled", summary: "cancelled", durationMs: Date.now() - startedAt };
    return last ? ClaudeEventMapper.toRunResult(last) : { status: "error", summary: "Claude stopped without a result", durationMs: Date.now() - startedAt };
  }
}
