import type { StepEvent, Usage } from "../domain/runState";

export type AgentRunRequest = {
  cwd: string; // the host project root
  model: { id: string };
  message: string;
  key: string; // "<runId>:<stepId>:<attempt>", the same for a retry of the same attempt
  // The project's agent files, for runtimes that don't read the project's
  // agent folder themselves. Optional; a runtime may ignore it.
  subagents?: { name: string; description: string; prompt: string }[];
  // Project folders (ending in "/") the agent must not read or change. A
  // runtime that can refuse tool calls refuses those, and agent configuration
  // files (AGENT_CONFIG_PATHS); every runtime's writes are checked afterwards.
  doNotTouch?: string[];
};

export type AgentRunResult = {
  status: "finished" | "error" | "cancelled";
  summary: string; // the agent's final message
  usage?: Usage;
  durationMs: number;
};

// One agent run that has been started.
export interface RunHandle {
  readonly id: string;
  events(): AsyncIterable<StepEvent>;
  wait(): Promise<AgentRunResult>;
  cancel(): Promise<void>;
}

// Something that can run an agent: Cursor or Claude through a provider, or a fake in tests.
export interface AgentRuntime {
  start(request: AgentRunRequest): Promise<RunHandle>;
  // Reconnects to a run started earlier; null when it can't be found.
  attach(runId: string, cwd: string): Promise<RunHandle | null>;
}
