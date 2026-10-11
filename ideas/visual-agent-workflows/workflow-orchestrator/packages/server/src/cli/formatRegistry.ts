import type { Registry } from "@orch/core";

const kB = (bytes: number) => `${(bytes / 1024).toFixed(1)} kB`;
const pad = (text: string, width: number) => text.padEnd(width);

// The registry as plain text for a terminal: one section per kind with its
// count, names in one column, descriptions on the line below. No colours.
export function formatRegistry(registry: Registry): string {
  const nameWidth = Math.max(0, ...registry.skills.map((s) => s.name.length), ...registry.agents.map((a) => a.name.length)) + 2;
  const indent = " ".repeat(2 + nameWidth);
  const agentPathWidth = Math.max(0, ...registry.agents.map((a) => a.path.length)) + 2;
  const artefactWidth = Math.max(0, ...registry.artefacts.map((a) => a.path.length)) + 2;
  const out: string[] = [`project    ${registry.root}`, ""];

  out.push(`skills (${registry.skills.length})`);
  for (const skill of registry.skills) {
    out.push(`  ${pad(skill.name, nameWidth)}${skill.path}`);
    if (skill.description) out.push(`${indent}${skill.description}`);
  }
  out.push("");

  out.push(`agents (${registry.agents.length})`);
  for (const agent of registry.agents) {
    const model = agent.model ? `${pad(agent.path, agentPathWidth)}model: ${agent.model}` : agent.path;
    out.push(`  ${pad(agent.name, nameWidth)}${model}`);
    if (agent.description) out.push(`${indent}${agent.description}`);
  }
  out.push("");

  out.push(`artefacts (${registry.artefacts.length})`);
  for (const artefact of registry.artefacts) out.push(`  ${pad(artefact.path, artefactWidth)}${kB(artefact.size)}`);
  out.push("");

  out.push(`warnings (${registry.warnings.length})`);
  for (const warning of registry.warnings) out.push(`  ${warning.path}  ${warning.message}`);

  return `${out.join("\n")}\n`;
}
