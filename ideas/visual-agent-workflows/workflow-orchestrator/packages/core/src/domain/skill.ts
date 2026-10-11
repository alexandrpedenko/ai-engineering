import { frontmatterFields, stringField } from "./frontmatterFields";
import type { MarkdownDoc, RegistryWarning, Skill } from "./registry";

// A skill from its SKILL.md. The name is the folder holding SKILL.md; folders
// above it (categories) are ignored. Problems become warnings; a skill is
// always returned.
export function toSkill(doc: MarkdownDoc): { skill: Skill; warnings: RegistryWarning[] } {
  const { fields, warnings } = frontmatterFields(doc);
  const segments = doc.path.split("/");
  const name = segments.at(-2) ?? doc.path;

  const description = stringField(fields, "description");
  if (!description) warnings.push({ path: doc.path, message: "missing description" });

  const declaredName = stringField(fields, "name");
  if (declaredName && declaredName !== name) {
    warnings.push({ path: doc.path, message: `name "${declaredName}" differs from folder "${name}"; using "${name}"` });
  }

  return { skill: { name, path: doc.path, description: description ?? "", body: doc.body.trim() }, warnings };
}
