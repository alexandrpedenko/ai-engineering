import {
  Annotation,
  type BaseCheckpointSaver,
  Command,
  END,
  interrupt,
  type LangGraphRunnableConfig,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { ConflictError } from "../application/errors";
import type { RunEngine, RunOutcome } from "../application/RunEngine";
import { GateDecision, type RunEvent, type RunState, type StepRecord } from "../domain/runState";
import type { AgentStep, GateStep, Workflow } from "../domain/workflow";

function appendPerKey<T>(current: Record<string, T[]>, update: Record<string, T[]>): Record<string, T[]> {
  const merged = { ...current };
  for (const [key, items] of Object.entries(update)) merged[key] = [...(merged[key] ?? []), ...items];
  return merged;
}

// RunState as a LangGraph state, with how each key combines updates.
const RunStateAnnotation = Annotation.Root({
  workflowId: Annotation<string>(),
  inputs: Annotation<Record<string, string>>(),
  steps: Annotation<Record<string, StepRecord>>({ reducer: (a, b) => ({ ...a, ...b }), default: () => ({}) }),
  feedback: Annotation<Record<string, string[]>>({ reducer: appendPerKey, default: () => ({}) }),
  decisions: Annotation<Record<string, GateDecision[]>>({ reducer: appendPerKey, default: () => ({}) }),
  revisions: Annotation<Record<string, number>>({ reducer: (a, b) => ({ ...a, ...b }), default: () => ({}) }),
  stoppedAt: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
});

// Node names are step ids, known only when a workflow is loaded; LangGraph's
// types expect them at compile time, so the builder is typed with `string`.
type GraphBuilder = StateGraph<typeof RunStateAnnotation.spec, RunState, Partial<RunState>, string>;

type GatePause = { gateId: string; shows: string[] };

export type AgentStepRunner = (runId: string, step: AgentStep, state: RunState) => Promise<StepRecord>;

export type LangGraphRunEngineOptions = {
  checkpointer: BaseCheckpointSaver;
  agentStep: AgentStepRunner;
  onEvent?: (runId: string, event: RunEvent) => void;
};

const configFor = (runId: string) => ({ configurable: { thread_id: runId } });

function runIdOf(config: LangGraphRunnableConfig): string {
  const runId: unknown = config.configurable?.thread_id;
  if (typeof runId !== "string") throw new Error("graph called without a thread_id");
  return runId;
}

// The gate's work: pause, then record the answer. Nothing happens before the
// interrupt, because the node runs again from its first line on resume.
function gateNode(gate: GateStep, state: RunState): Partial<RunState> {
  const pause: GatePause = { gateId: gate.id, shows: gate.shows };
  const decision = GateDecision.parse(interrupt(pause));
  const decisions = { [gate.id]: [decision] };
  if (decision.decision === "approve") return { decisions };

  const sentBack = state.revisions[gate.id] ?? 0;
  if (sentBack >= gate.maxRevisions) return { decisions, stoppedAt: gate.id };
  return { decisions, feedback: { [gate.onReject]: [decision.feedback] }, revisions: { [gate.id]: sentBack + 1 } };
}

// RunEngine on LangGraph. The workflow is compiled into a graph on every call;
// the run id is the LangGraph thread id, and the checkpointer keeps runs
// between calls (and across restarts, with a persistent checkpointer).
export class LangGraphRunEngine implements RunEngine {
  constructor(private readonly options: LangGraphRunEngineOptions) {}

  async start(runId: string, workflow: Workflow, inputs: Record<string, string>): Promise<RunOutcome> {
    const graph = this.compile(workflow);
    if (await this.read(graph, runId)) throw new ConflictError(`run "${runId}" already exists`);
    await graph.invoke({ workflowId: workflow.id, inputs }, configFor(runId));
    return await this.settle(graph, runId);
  }

  async resume(runId: string, workflow: Workflow, decision: GateDecision): Promise<RunOutcome> {
    const graph = this.compile(workflow);
    const current = await this.read(graph, runId);
    if (current?.status !== "waiting") {
      throw new ConflictError(`run "${runId}" is ${current ? current.status : "unknown"}, not waiting at a gate`);
    }
    await graph.invoke(new Command({ resume: decision }), configFor(runId));
    return await this.settle(graph, runId);
  }

  async outcome(runId: string, workflow: Workflow): Promise<RunOutcome | null> {
    return await this.read(this.compile(workflow), runId);
  }

  private compile(workflow: Workflow) {
    const graph = new StateGraph(RunStateAnnotation) as unknown as GraphBuilder;
    const nextOf = new Map(workflow.edges.map((edge) => [edge.from, edge.to]));
    const after = (id: string): string => nextOf.get(id) ?? END;
    const hasIncoming = new Set(workflow.edges.map((edge) => edge.to));

    for (const step of workflow.steps) {
      if (step.type === "agent") {
        graph.addNode(step.id, async (state: RunState, config: LangGraphRunnableConfig) => ({
          steps: { [step.id]: await this.options.agentStep(runIdOf(config), step, state) },
        }));
        graph.addConditionalEdges(
          step.id,
          (state: RunState) => (state.steps[step.id]?.status === "failed" ? END : after(step.id)),
          [...new Set([after(step.id), END])],
        );
      } else {
        graph.addNode(step.id, (state: RunState) => gateNode(step, state));
        graph.addConditionalEdges(
          step.id,
          (state: RunState) => {
            if (state.stoppedAt === step.id) return END;
            return state.decisions[step.id]?.at(-1)?.decision === "approve" ? after(step.id) : step.onReject;
          },
          [...new Set([after(step.id), step.onReject, END])],
        );
      }
    }

    const start = workflow.steps.find((step) => !hasIncoming.has(step.id));
    if (!start) throw new Error(`workflow "${workflow.id}" has no start step`);
    graph.addEdge(START, start.id);
    return graph.compile({ checkpointer: this.options.checkpointer });
  }

  // Reads the outcome and reports a gate that is now waiting.
  private async settle(graph: ReturnType<LangGraphRunEngine["compile"]>, runId: string): Promise<RunOutcome> {
    const outcome = await this.read(graph, runId);
    if (!outcome) throw new Error(`run "${runId}" has no state after running`);
    if (outcome.status === "waiting") {
      this.options.onEvent?.(runId, { type: "gate-waiting", gateId: outcome.gateId, shows: outcome.shows });
    }
    return outcome;
  }

  private async read(graph: ReturnType<LangGraphRunEngine["compile"]>, runId: string): Promise<RunOutcome | null> {
    const snapshot = await graph.getState(configFor(runId));
    if (!snapshot.createdAt) return null;
    const state = snapshot.values as RunState;

    const pause = snapshot.tasks.flatMap((task) => task.interrupts).at(0)?.value as GatePause | undefined;
    if (pause) return { status: "waiting", gateId: pause.gateId, shows: pause.shows, state };

    const failed = Object.entries(state.steps).find(([, record]) => record.status === "failed");
    if (failed) return { status: "failed", stepId: failed[0], state };
    if (state.stoppedAt) return { status: "rejected", gateId: state.stoppedAt, state };
    if (snapshot.next.length > 0) throw new Error(`run "${runId}" stopped inside "${snapshot.next.join(", ")}"`);
    return { status: "finished", state };
  }
}
