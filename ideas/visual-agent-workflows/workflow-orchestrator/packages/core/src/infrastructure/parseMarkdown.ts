import { parse } from "yaml";
import type { MarkdownDoc, UnreadableDoc } from "../domain/registry";

// Splits a markdown file into its YAML frontmatter (between a first line "---"
// and the next "---" line) and the body. A file without frontmatter gets `{}`.
// Invalid YAML or a missing closing "---" gives an UnreadableDoc.
export function parseMarkdown(path: string, text: string): MarkdownDoc | UnreadableDoc {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") return { path, frontmatter: {}, body: lines.join("\n") };

  const close = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (close === -1) return { path, error: "frontmatter has no closing ---" };

  try {
    const frontmatter: unknown = parse(lines.slice(1, close).join("\n"));
    return { path, frontmatter: frontmatter ?? {}, body: lines.slice(close + 1).join("\n") };
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    return { path, error: `invalid YAML frontmatter: ${message}` };
  }
}
