import { frontmatterFields, stringField } from "./frontmatterFields";
import type { AgentDef, MarkdownDoc, RegistryWarning } from "./registry";

// An agent (persona) from its .md file. The name is the frontmatter `name`, or
// the file name without ".md". `model` is kept only when it is a string.
export function toAgentDef(doc: MarkdownDoc): { agent: AgentDef; warnings: RegistryWarning[] } {
  const { fields, warnings } = frontmatterFields(doc);
  const fileName = doc.path.split("/").at(-1) ?? doc.path;
  const name = stringField(fields, "name") ?? fileName.replace(/\.md$/, "");

  const description = stringField(fields, "description");
  if (!description) warnings.push({ path: doc.path, message: "missing description" });

  const model = stringField(fields, "model");
  const agent: AgentDef = { name, path: doc.path, description: description ?? "", body: doc.body.trim() };
  if (model) agent.model = model;

  return { agent, warnings };
}
