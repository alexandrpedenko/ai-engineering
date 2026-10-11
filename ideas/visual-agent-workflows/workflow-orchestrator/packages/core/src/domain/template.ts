const INPUT_REF = /\{\{\s*inputs\.([a-zA-Z][a-zA-Z0-9_-]*)\s*\}\}/g;

// Replaces every {{inputs.x}} with the value of input x ("" when it has none).
// No other template syntax exists.
export function fillTemplate(text: string, inputs: Record<string, string>): string {
  return text.replace(INPUT_REF, (_, id: string) => inputs[id] ?? "");
}

// The input ids a text refers to, each once, in order of first use.
export function templateRefs(text: string): string[] {
  return [...new Set([...text.matchAll(INPUT_REF)].map((m) => m[1] as string))];
}
