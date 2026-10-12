import type { FileChange } from "./outputs";

// Files that configure the agents themselves (hooks, MCP servers, tool
// permissions) and git's own folder. An agent step must not change them:
// the change would take effect on the next step, outside any review.
export const AGENT_CONFIG_PATHS = [
  ".git/",
  ".claude/settings.json",
  ".claude/settings.local.json",
  ".claude/hooks/",
  ".mcp.json",
  ".cursor/mcp.json",
  ".cursor/hooks.json",
  ".cursor/hooks/",
  ".cursor/cli.json",
  ".cursor/environment.json",
];

// Whether a project path is protected: inside one of `doNotTouch`'s folders
// (each ends with "/") or one of AGENT_CONFIG_PATHS (a folder when it ends
// with "/", else a file). Paths are project-relative with "/" separators.
export function isProtected(path: string, doNotTouch: string[]): boolean {
  return [...doNotTouch, ...AGENT_CONFIG_PATHS].some((entry) => (entry.endsWith("/") ? path.startsWith(entry) : path === entry));
}

// The changed files a step was not allowed to change, in the order given.
export function protectedWrites(writes: FileChange[], doNotTouch: string[]): string[] {
  return writes.filter((write) => isProtected(write.path, doNotTouch)).map((write) => write.path);
}
