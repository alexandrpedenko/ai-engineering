import type { ProjectFiles, Registry, RunEngine, RunFiles, RunSupervisor, WorkflowStore } from "@orch/core";

// What the routes need, built by composition.ts.
export type ServerServices = {
  scan: () => Promise<Registry>;
  projectFiles: ProjectFiles;
  store: WorkflowStore;
  runFiles: RunFiles;
  engine: RunEngine;
  supervisor: RunSupervisor;
};
