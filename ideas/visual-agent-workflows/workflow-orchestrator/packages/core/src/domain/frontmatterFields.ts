import type { MarkdownDoc, RegistryWarning } from "./registry";

// The frontmatter of a doc as key/value fields, plus a warning when it is not
// a key: value mapping (then the fields are empty).
export function frontmatterFields(doc: MarkdownDoc): { fields: Record<string, unknown>; warnings: RegistryWarning[] } {
  const fm = doc.frontmatter;
  if (fm !== null && typeof fm === "object" && !Array.isArray(fm)) {
    return { fields: fm as Record<string, unknown>, warnings: [] };
  }
  return { fields: {}, warnings: [{ path: doc.path, message: "frontmatter is not a key: value mapping" }] };
}

// The field as a trimmed string, or undefined when it is missing, empty or not a string.
export function stringField(fields: Record<string, unknown>, key: string): string | undefined {
  const value = fields[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}
