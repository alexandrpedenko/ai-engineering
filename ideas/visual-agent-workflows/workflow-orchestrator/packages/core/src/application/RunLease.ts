// Who may move runs in a project right now, across processes (ADR-0018).
export type LeaseHolder = { pid: number; runId: string; since: string; alive: boolean; mine: boolean };

export interface RunLease {
  // Takes the project's lease for `runId`. ConflictError when another live
  // process holds it, or this process holds it for another run. A lease left
  // by a process that has stopped is taken over.
  acquire(runId: string): Promise<void>;
  // Gives the lease back, if this process holds it for `runId`.
  release(runId: string): Promise<void>;
  // The current holder, or null when nobody holds the lease.
  holder(): Promise<LeaseHolder | null>;
}
