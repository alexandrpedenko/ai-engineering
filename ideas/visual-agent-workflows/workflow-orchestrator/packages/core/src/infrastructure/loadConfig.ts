import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { z } from "zod";
import { InvalidConfigError } from "../application/errors";
import { OrchestratorConfig, type ResolvedConfig } from "../domain/config";

const CONFIG_FILE = "orchestrator.config.json";

function problemsOf(error: z.ZodError): { key: string; message: string }[] {
  return error.issues.flatMap((issue) =>
    issue.code === "unrecognized_keys"
      ? issue.keys.map((key) => ({ key, message: "unknown key" }))
      : [{ key: issue.path.join(".") || "(root)", message: issue.message }],
  );
}

async function readRaw(configPath: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new InvalidConfigError(configPath, [{ key: "(file)", message: (error as Error).message }]);
  }
}

async function isFolder(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

// Reads <orchestratorDir>/orchestrator.config.json (all defaults if it is
// missing) and makes its folders absolute. Relative paths resolve against
// orchestratorDir, not the current directory. `overrides` win over the file.
// Does not read environment variables.
export async function loadConfig(
  orchestratorDir: string,
  overrides: { projectRoot?: string; dataDir?: string } = {},
): Promise<ResolvedConfig> {
  const configPath = join(orchestratorDir, CONFIG_FILE);
  const parsed = OrchestratorConfig.safeParse(await readRaw(configPath));
  if (!parsed.success) throw new InvalidConfigError(configPath, problemsOf(parsed.error));

  const projectRoot = resolve(orchestratorDir, overrides.projectRoot ?? parsed.data.projectRoot);
  if (!(await isFolder(projectRoot))) {
    throw new InvalidConfigError(configPath, [{ key: "projectRoot", message: `${projectRoot} is not a folder` }]);
  }

  return { ...parsed.data, orchestratorDir, projectRoot, dataDir: resolve(orchestratorDir, overrides.dataDir ?? parsed.data.dataDir) };
}
