// The editor language for a file, by its extension. Anything not listed is
// plain text.
const LANGUAGES: Record<string, string> = {
  md: "markdown",
  mdx: "markdown",
  json: "json",
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  yaml: "yaml",
  yml: "yaml",
  css: "css",
  html: "html",
  py: "python",
};

export function languageOf(path: string): string {
  const name = path.split("/").at(-1) ?? "";
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "plaintext";
  return LANGUAGES[name.slice(dot + 1).toLowerCase()] ?? "plaintext";
}
