import type { AgentRunRequest, AgentRunResult } from "../../application/AgentRuntime";
import type { RuntimeKind } from "../../domain/config";
import type { StepEvent } from "../../domain/runState";

// One agent run as a provider sees it.
export interface ProviderRun {
  readonly id: string;
  events(): AsyncIterable<StepEvent>;
  result(): Promise<AgentRunResult>;
  cancel(): Promise<void>;
}

// What differs between agent SDKs. ProviderAgentRuntime does everything else.
export interface AgentProvider {
  readonly name: RuntimeKind;
  // Starts an agent run. Rejects when the agent can't start (plan, key, model…),
  // so the step can fail cleanly instead of crashing.
  open(request: AgentRunRequest): Promise<ProviderRun>;
  // A run started by an earlier process: the run, "cut-off" when it was
  // stopped with its process, or null when the provider doesn't know it.
  find(runId: string, cwd: string): Promise<ProviderRun | "cut-off" | null>;
}
