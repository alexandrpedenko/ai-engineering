import { GateDecision, type RunEvent } from "../domain/runState";
import type { Registry } from "../domain/registry";
import type { RunHandle } from "./AgentRuntime";
import { ConflictError, InvalidInputError, NotFoundError } from "./errors";
import type { EventLog, LogEvent, LoggedEvent } from "./EventLog";
import { loadRunWorkflow } from "./loadRunWorkflow";
import { prepareRun } from "./prepareRun";
import type { RunEngine, RunOutcome } from "./RunEngine";
import type { RunFiles } from "./RunFiles";
import type { RunLease } from "./RunLease";
import type { WorkflowStore } from "./WorkflowStore";

export type RunSupervisorDeps = {
  engine: RunEngine;
  runFiles: RunFiles;
  eventLog: EventLog;
  store: WorkflowStore;
  registry: () => Promise<Registry>;
  newId: () => string;
  now: () => Date;
  // Throws when runs can't be started at all (e.g. no API key). Checked before
  // every start, resume, continue and retry.
  assertCanRun?: () => void;
  // The project's lease across processes (ADR-0018); none in tests that don't need it.
  lease?: RunLease;
  // Deletes the git trees kept for a run's gates (ProjectFiles.forgetTrees).
  forgetTrees?: (runId: string) => Promise<void>;
  // Called when something the run doesn't depend on fails: writing to the
  // event log, cancelling an agent run. The run itself goes on.
  reportError?: (error: unknown) => void;
};

type Listener = (event: LoggedEvent) => void;

export const ORPHANED_MESSAGE = "the process moving this run stopped before it settled";

// Runs workflows in the background so callers get an answer at once. Allows
// one moving run per project (ADR-0018) and one operation per run at a time.
// Numbers every event of a run, writes it to the event log and hands it to
// live listeners; ends each operation with "run-settled" (or "run-crashed"
// when the engine throws).
export class RunSupervisor {
  private readonly busy = new Set<string>();
  private readonly operations = new Map<string, Promise<void>>();
  private readonly handles = new Map<string, RunHandle>();
  private readonly cancelRequested = new Set<string>();
  private readonly cancels = new Map<string, Promise<void>>();
  private readonly seqs = new Map<string, number>();
  private readonly writes = new Map<string, Promise<void>>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private stopping = false;

  constructor(private readonly deps: RunSupervisorDeps) {}

  // For the engine and the agent step: every RunEvent goes through here.
  readonly onEvent = (runId: string, event: RunEvent): void => this.record(runId, event);

  // For the agent step: the agent run currently being waited on.
  readonly onHandle = (runId: string, handle: RunHandle | null): void => {
    if (!handle) {
      this.handles.delete(runId);
      return;
    }
    this.handles.set(runId, handle);
    if (this.cancelRequested.delete(runId)) this.cancelQuietly(runId, handle);
  };

  async start(workflowId: string, inputs: Record<string, string>): Promise<{ runId: string }> {
    this.deps.assertCanRun?.();
    this.assertNoOtherMoving();
    const workflow = await this.deps.store.get(workflowId);
    if (!workflow) throw new NotFoundError(`no workflow "${workflowId}"`);
    const runId = await prepareRun(
      { runFiles: this.deps.runFiles, registry: await this.deps.registry(), phases: await this.deps.store.phases(), newId: this.deps.newId, now: this.deps.now },
      workflow,
      inputs,
    );
    await this.launch(runId, async () => await this.deps.engine.start(runId, workflow, inputs));
    return { runId };
  }

  async resume(runId: string, decision: unknown): Promise<void> {
    const parsed = GateDecision.safeParse(decision);
    if (!parsed.success) {
      throw new InvalidInputError("invalid gate decision", parsed.error.issues.map((i) => ({ severity: "error", message: i.message })));
    }
    const workflow = await this.expect(runId, "waiting");
    await this.launch(runId, async () => await this.deps.engine.resume(runId, workflow, parsed.data));
  }

  async continue(runId: string): Promise<void> {
    const workflow = await this.expect(runId, "interrupted");
    await this.launch(runId, async () => await this.deps.engine.continue(runId, workflow));
  }

  // Runs the failed step of a failed run again as a new attempt.
  async retry(runId: string): Promise<void> {
    const workflow = await this.expect(runId, "failed");
    await this.launch(runId, async () => await this.deps.engine.retry(runId, workflow));
  }

  // Cancels the agent run of the step in progress. A run that is moving but
  // hasn't reached its agent call yet is cancelled as soon as it does.
  async cancel(runId: string): Promise<void> {
    const handle = this.handles.get(runId);
    if (handle) {
      await handle.cancel();
      return;
    }
    if (!this.busy.has(runId)) throw new ConflictError(`run "${runId}" is not moving`);
    this.cancelRequested.add(runId);
  }

  // Forgets a run that isn't moving: its files, event log, engine state and
  // gate trees. NotFoundError for an unknown run.
  async delete(runId: string): Promise<void> {
    if (!(await this.deps.runFiles.loadRun(runId))) throw new NotFoundError(`no run "${runId}"`);
    if (this.busy.has(runId)) throw new ConflictError(`run "${runId}" is moving; cancel it first`);
    const holder = await this.deps.lease?.holder();
    if (holder?.alive && holder.runId === runId) throw new ConflictError(`run "${runId}" is moving in another process (pid ${holder.pid})`);
    await this.deps.engine.deleteRun(runId);
    await this.deps.forgetTrees?.(runId);
    await this.deps.runFiles.deleteRun(runId);
    this.seqs.delete(runId);
    this.writes.delete(runId);
  }

  isBusy(runId: string): boolean {
    return this.busy.has(runId);
  }

  // Resolves when the run's current operation (if any) has ended and its
  // events are written.
  async settled(runId: string): Promise<void> {
    await this.operations.get(runId);
    await this.cancels.get(runId);
    await this.writes.get(runId);
  }

  // Refuses new operations, cancels the agent runs in progress and waits for
  // every operation to end and every event to be written.
  async shutdown(): Promise<void> {
    this.stopping = true;
    for (const [runId, handle] of this.handles) this.cancelQuietly(runId, handle);
    for (const runId of this.busy) this.cancelRequested.add(runId);
    await Promise.all([...this.operations.keys()].map(async (runId) => await this.settled(runId)));
  }

  // Calls `listener` with every event after `after`: first those already
  // logged, then live ones, each once and in order. Returns the unsubscribe.
  // A run whose log ends mid-operation while no process moves it gets a
  // "run-crashed" event first, so a watcher doesn't wait for it forever.
  async watch(runId: string, after: number, listener: Listener): Promise<() => void> {
    if (!(await this.deps.runFiles.loadRun(runId))) throw new NotFoundError(`no run "${runId}"`);
    await this.markOrphaned(runId);
    let last = after;
    const buffered: LoggedEvent[] = [];
    let replaying = true;
    const deliver = (event: LoggedEvent) => {
      if (event.seq <= last) return;
      last = event.seq;
      listener(event);
    };
    const unsubscribe = this.subscribe(runId, (event) => (replaying ? buffered.push(event) : deliver(event)));
    // Events already numbered may still be on their way to the log.
    await this.writes.get(runId);
    for (const event of await this.deps.eventLog.read(runId, after)) deliver(event);
    for (const event of buffered.splice(0)) deliver(event);
    replaying = false;
    return unsubscribe;
  }

  // Records "run-crashed" for a run that no process moves but whose last
  // logged event is not "run-settled" or "run-crashed".
  private async markOrphaned(runId: string): Promise<void> {
    if (this.busy.has(runId)) return;
    await this.writes.get(runId);
    const lastEvent = (await this.deps.eventLog.read(runId)).at(-1);
    if (!lastEvent || lastEvent.event.type === "run-settled" || lastEvent.event.type === "run-crashed") return;
    const holder = await this.deps.lease?.holder();
    if (holder?.alive && !holder.mine && holder.runId === runId) return;
    if (!this.seqs.has(runId)) this.seqs.set(runId, lastEvent.seq);
    this.record(runId, { type: "run-crashed", message: ORPHANED_MESSAGE });
    await this.writes.get(runId);
  }

  private subscribe(runId: string, listener: Listener): () => void {
    const set = this.listeners.get(runId) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(runId, set);
    return () => set.delete(listener);
  }

  private assertNoOtherMoving(runId?: string): void {
    if (this.stopping) throw new ConflictError("the orchestrator is stopping");
    const other = [...this.busy].find((id) => id !== runId);
    if (other) throw new ConflictError(`run "${other}" is moving; one run moves at a time in a project`);
  }

  // The run's workflow, after checking the run is idle and has this status.
  private async expect(runId: string, status: RunOutcome["status"]) {
    this.deps.assertCanRun?.();
    if (this.busy.has(runId)) throw new ConflictError(`run "${runId}" is busy`);
    this.assertNoOtherMoving(runId);
    const workflow = await loadRunWorkflow(this.deps.runFiles, runId);
    const outcome = await this.deps.engine.outcome(runId, workflow);
    if (outcome?.status !== status) {
      throw new ConflictError(`run "${runId}" is ${outcome?.status ?? "not started"}, not ${status}`);
    }
    return workflow;
  }

  // Marks the run busy, takes the project lease and runs the operation in the
  // background. Nothing is left marked busy when this throws.
  private async launch(runId: string, operation: () => Promise<RunOutcome>): Promise<void> {
    if (this.busy.has(runId)) throw new ConflictError(`run "${runId}" is busy`);
    this.assertNoOtherMoving(runId);
    this.busy.add(runId);
    try {
      if (!this.seqs.has(runId)) this.seqs.set(runId, await this.deps.eventLog.lastSeq(runId));
      await this.deps.lease?.acquire(runId);
    } catch (error) {
      this.busy.delete(runId);
      throw error;
    }

    const running = (async () => {
      try {
        this.record(runId, { type: "run-settled", outcome: await operation() });
      } catch (error) {
        this.record(runId, { type: "run-crashed", message: error instanceof Error ? error.message : String(error) });
      } finally {
        await this.cancels.get(runId);
        this.cancels.delete(runId);
        this.busy.delete(runId);
        this.handles.delete(runId);
        this.cancelRequested.delete(runId);
        await this.releaseLease(runId);
      }
    })();
    this.operations.set(runId, running);
  }

  private async releaseLease(runId: string): Promise<void> {
    try {
      await this.deps.lease?.release(runId);
    } catch (error) {
      this.deps.reportError?.(error);
    }
  }

  // Cancels an agent run without waiting; a failure is reported, not thrown.
  private cancelQuietly(runId: string, handle: RunHandle): void {
    this.cancels.set(
      runId,
      (async () => {
        try {
          await handle.cancel();
        } catch (error) {
          this.deps.reportError?.(error);
        }
      })(),
    );
  }

  private record(runId: string, event: LogEvent): void {
    const seq = (this.seqs.get(runId) ?? 0) + 1;
    this.seqs.set(runId, seq);
    const logged: LoggedEvent = { seq, at: this.deps.now().toISOString(), event };
    for (const listener of this.listeners.get(runId) ?? []) listener(logged);

    const previous = this.writes.get(runId);
    const write = (async () => {
      await previous;
      try {
        await this.deps.eventLog.append(runId, logged);
      } catch (error) {
        this.deps.reportError?.(error);
      }
    })();
    this.writes.set(runId, write);
  }
}
