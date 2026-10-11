import type { AgentRuntime } from "../../src/application/AgentRuntime";
import type { AgentStepDeps } from "../../src/application/runAgentStep";
import type { RunEvent } from "../../src/domain/runState";
import { FakeProjectFiles } from "./FakeProjectFiles";
import { MemoryRunFiles } from "./MemoryRunFiles";
import { registry } from "./workflows";

// AgentStepDeps for tests: the test registry, in-memory run files, fake
// project files, and every event collected in `events`.
export function agentDeps(runtime: AgentRuntime, overrides: Partial<AgentStepDeps> = {}) {
  const events: RunEvent[] = [];
  const runFiles = new MemoryRunFiles();
  const projectFiles = new FakeProjectFiles();
  const deps: AgentStepDeps = {
    runtime,
    registry,
    projectFiles,
    runFiles,
    cwd: "/host",
    artefactGlobs: ["discovery/**"],
    defaultModel: { id: "composer-2.5" },
    doNotTouch: ["workflow-orchestrator/"],
    onEvent: (_, event) => events.push(event),
    now: () => new Date("2026-10-11T12:00:00Z"),
    ...overrides,
  };
  return { deps, events, runFiles, projectFiles };
}
