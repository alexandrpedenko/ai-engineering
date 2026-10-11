import { toAgentDef } from "../domain/agentDef";
import type { AgentDef, MarkdownDoc, Registry, RegistryWarning, Skill, UnreadableDoc } from "../domain/registry";
import { toSkill } from "../domain/skill";
import type { ProjectFiles } from "./ProjectFiles";

const isUnreadable = (doc: MarkdownDoc | UnreadableDoc): doc is UnreadableDoc => "error" in doc;

// Keeps the first item of each name in read order; later ones become warnings.
function firstByName<T extends { name: string; path: string }>(items: T[], kind: string, warnings: RegistryWarning[]): T[] {
  const kept = new Map<string, T>();
  for (const item of items) {
    const first = kept.get(item.name);
    if (first) {
      warnings.push({ path: item.path, message: `duplicate ${kind} "${item.name}" (first: ${first.path}); ignored` });
    } else {
      kept.set(item.name, item);
    }
  }
  return [...kept.values()];
}

// Everything the orchestrator can use from the host project, plus a warning
// for each file it could not use.
export async function scanProject(files: ProjectFiles): Promise<Registry> {
  const [skillDocs, agentDocs, artefacts] = await Promise.all([files.skillDocs(), files.agentDocs(), files.artefacts()]);
  const warnings: RegistryWarning[] = [];

  const skills: Skill[] = [];
  for (const doc of skillDocs) {
    if (isUnreadable(doc)) {
      warnings.push({ path: doc.path, message: `could not read: ${doc.error}` });
      continue;
    }
    const result = toSkill(doc);
    skills.push(result.skill);
    warnings.push(...result.warnings);
  }

  const agents: AgentDef[] = [];
  for (const doc of agentDocs) {
    if (isUnreadable(doc)) {
      warnings.push({ path: doc.path, message: `could not read: ${doc.error}` });
      continue;
    }
    const result = toAgentDef(doc);
    agents.push(result.agent);
    warnings.push(...result.warnings);
  }

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return {
    root: files.root,
    skills: firstByName(skills, "skill", warnings).sort(byName),
    agents: firstByName(agents, "agent", warnings).sort(byName),
    artefacts: [...artefacts].sort((a, b) => a.path.localeCompare(b.path)),
    warnings,
  };
}
