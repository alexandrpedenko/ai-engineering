import type { ProjectFiles, Registry, RunEngine, RunFiles, RunSupervisor, RuntimeKind, WorkflowStore } from "@orch/core";

// What GET /api/health reports besides "up".
export type HealthInfo = { version: string; git: boolean; dataDirWritable: boolean; credentials: boolean };

// What the routes need, built by composition.ts.
export type ServerServices = {
  runtimeName: RuntimeKind | "fake";
  scan: () => Promise<Registry>;
  projectFiles: ProjectFiles;
  store: WorkflowStore;
  runFiles: RunFiles;
  engine: RunEngine;
  supervisor: RunSupervisor;
  health: () => Promise<HealthInfo>;
};
