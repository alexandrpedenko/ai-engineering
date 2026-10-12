import type { HookCallback, HookJSONOutput } from "@anthropic-ai/claude-agent-sdk";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { isProtected } from "../../../domain/protectedPaths";
import { isSecret } from "../../secretFiles";

// The tool input fields that name a file or folder.
const PATH_FIELDS = ["file_path", "path", "notebook_path"];

// Why a tool may not use `path` (absolute, or relative to `cwd`), or null when
// it may: outside the project, a protected path, or a credential file.
export function refusalFor(path: string, cwd: string, doNotTouch: string[]): string | null {
  const inside = relative(cwd, resolve(cwd, path));
  if (inside.startsWith("..") || isAbsolute(inside)) return `${path} is outside the project`;
  const projectPath = inside.split(sep).join("/");
  if (projectPath === "") return null;
  if (isProtected(projectPath, doNotTouch) || isProtected(`${projectPath}/`, doNotTouch)) return `${projectPath} is protected`;
  if (isSecret(projectPath)) return `${projectPath} may hold credentials`;
  return null;
}

// A PreToolUse hook that refuses file tools on paths `refusalFor` refuses.
export function pathGuard(cwd: string, doNotTouch: string[]): HookCallback {
  return async (input): Promise<HookJSONOutput> => {
    if (input.hook_event_name !== "PreToolUse" || typeof input.tool_input !== "object" || input.tool_input === null) return {};
    const fields = input.tool_input as Record<string, unknown>;
    for (const field of PATH_FIELDS) {
      const value = fields[field];
      if (typeof value !== "string") continue;
      const reason = refusalFor(value, cwd, doNotTouch);
      if (reason) {
        return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `Refused: ${reason}.` } };
      }
    }
    return {};
  };
}
