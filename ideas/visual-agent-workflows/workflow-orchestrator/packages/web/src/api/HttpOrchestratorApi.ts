import type { GateDecision, LoggedEvent, LogEvent, Phase, Problem, Registry, RunSummary, Workflow, WorkflowSummary } from "@orch/core";
import type { z } from "zod";
import type { OrchestratorApi } from "../application/OrchestratorApi";
import { ApiError } from "../domain/apiError";
import type { RunDetails } from "../domain/runView";
import * as schemas from "./responseSchemas";

// Every event type the server sends on a run's stream.
const LOG_EVENT_TYPES = ["step-started", "agent-event", "step-finished", "gate-waiting", "run-settled", "run-crashed"];

// The part of the browser's EventSource this client uses (tests pass a fake).
export type EventSourceLike = {
  addEventListener(type: string, listener: (message: MessageEvent<string>) => void): void;
  close(): void;
};

// OrchestratorApi over HTTP. `baseUrl` is "" in the browser (Vite proxies
// /api). Answers are checked against responseSchemas before they're used.
export class HttpOrchestratorApi implements OrchestratorApi {
  constructor(
    private readonly baseUrl = "",
    private readonly openEventSource: (url: string) => EventSourceLike = (url) => new EventSource(url),
  ) {}

  async health(): Promise<{ up: boolean; runtime?: string }> {
    const response = await fetch(`${this.baseUrl}/api/health`);
    if (!response.ok) return { up: false };
    const health = schemas.Health.parse(await response.json());
    return health.runtime ? { up: health.ok, runtime: health.runtime } : { up: health.ok };
  }

  async project(): Promise<Registry> {
    return (await this.get("/api/project", schemas.Registry)) as Registry;
  }

  async phases(): Promise<Phase[]> {
    return (await this.get("/api/phases", schemas.Phases)).phases as Phase[];
  }

  async workflows(): Promise<WorkflowSummary[]> {
    return (await this.get("/api/workflows", schemas.WorkflowSummaries)) as WorkflowSummary[];
  }

  async workflow(id: string): Promise<{ workflow: Workflow; problems: Problem[] }> {
    return (await this.get(`/api/workflows/${encodeURIComponent(id)}`, schemas.WorkflowWithProblems)) as {
      workflow: Workflow;
      problems: Problem[];
    };
  }

  async createWorkflow(workflow: Workflow): Promise<{ problems: Problem[] }> {
    return schemas.Problems.parse(await this.send("POST", "/api/workflows", { workflow })) as { problems: Problem[] };
  }

  async saveWorkflow(workflow: Workflow): Promise<{ problems: Problem[] }> {
    return schemas.Problems.parse(await this.send("PUT", `/api/workflows/${encodeURIComponent(workflow.id)}`, workflow)) as { problems: Problem[] };
  }

  async deleteWorkflow(id: string): Promise<void> {
    await this.send("DELETE", `/api/workflows/${encodeURIComponent(id)}`);
  }

  async checkWorkflow(workflow: Workflow): Promise<Problem[]> {
    return schemas.Problems.parse(await this.send("POST", "/api/workflows/check", { workflow })).problems as Problem[];
  }

  async runs(workflowId?: string): Promise<RunSummary[]> {
    const query = workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : "";
    return (await this.get(`/api/runs${query}`, schemas.RunSummaries)) as RunSummary[];
  }

  async run(runId: string): Promise<RunDetails> {
    return (await this.get(`/api/runs/${encodeURIComponent(runId)}`, schemas.RunDetails)) as unknown as RunDetails;
  }

  async file(path: string): Promise<{ path: string; content: string }> {
    return await this.get(`/api/files?path=${encodeURIComponent(path)}`, schemas.FileContent);
  }

  async startRun(workflowId: string, inputs: Record<string, string>): Promise<{ runId: string }> {
    const body = await this.send("POST", `/api/workflows/${encodeURIComponent(workflowId)}/runs`, { inputs });
    return schemas.Started.parse(body);
  }

  async resume(runId: string, decision: GateDecision): Promise<void> {
    await this.send("POST", `/api/runs/${encodeURIComponent(runId)}/resume`, decision);
  }

  async continueRun(runId: string): Promise<void> {
    await this.send("POST", `/api/runs/${encodeURIComponent(runId)}/continue`);
  }

  async retry(runId: string): Promise<void> {
    await this.send("POST", `/api/runs/${encodeURIComponent(runId)}/retry`);
  }

  async cancel(runId: string): Promise<void> {
    await this.send("POST", `/api/runs/${encodeURIComponent(runId)}/cancel`);
  }

  watchRun(runId: string, after: number, onEvent: (event: LoggedEvent) => void): () => void {
    const source = this.openEventSource(`${this.baseUrl}/api/runs/${encodeURIComponent(runId)}/events?after=${after}`);
    for (const type of LOG_EVENT_TYPES) {
      source.addEventListener(type, (message) => {
        const event = schemas.LogEventData.parse(JSON.parse(message.data)) as unknown as LogEvent;
        onEvent({ seq: Number(message.lastEventId), at: "", event });
      });
    }
    return () => source.close();
  }

  private async get<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> {
    return schema.parse(await this.send("GET", path));
  }

  // Sends a request; returns the parsed JSON body (undefined when empty).
  // A non-2xx answer throws ApiError with the server's message and problems.
  private async send(method: string, path: string, body?: unknown): Promise<unknown> {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { "content-type": "application/json" };
      init.body = JSON.stringify(body);
    }
    const response = await fetch(`${this.baseUrl}${path}`, init);
    const text = await response.text();
    const json: unknown = text ? JSON.parse(text) : undefined;
    if (!response.ok) {
      const error = schemas.ErrorBody.safeParse(json);
      throw new ApiError(response.status, error.success ? error.data.error : response.statusText, error.success ? (error.data.problems ?? []) : []);
    }
    return json;
  }
}
