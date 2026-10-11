import type { ProjectFiles, Registry, RunEngine, RunFiles, RunSupervisor, WorkflowStore } from "@orch/core";

// What the routes need, built by composition.ts.
export type ServerServices = {
  runtimeName: string; // "cursor", "claude" or "fake"
  scan: () => Promise<Registry>;
  projectFiles: ProjectFiles;
  store: WorkflowStore;
  runFiles: RunFiles;
  engine: RunEngine;
  supervisor: RunSupervisor;
};
