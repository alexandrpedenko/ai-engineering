import type { Registry } from "@orch/core";

export type FileKind = { kind: "skill" | "agent"; name: string } | { kind: "artefact" | "other" };

// What a project file is to the orchestrator: a skill or agent (with its
// name), an artefact, or some other project file.
export function fileKind(path: string, registry: Registry): FileKind {
  const skill = registry.skills.find((s) => s.path === path);
  if (skill) return { kind: "skill", name: skill.name };
  const agent = registry.agents.find((a) => a.path === path);
  if (agent) return { kind: "agent", name: agent.name };
  if (registry.artefacts.some((a) => a.path === path)) return { kind: "artefact" };
  return { kind: "other" };
}
