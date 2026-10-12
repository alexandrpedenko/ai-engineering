import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { z } from "zod";
import { InvalidConfigError } from "../application/errors";
import { OrchestratorConfig, type ResolvedConfig, RuntimeKind } from "../domain/config";
import { LocalSettings, type SettingSource } from "../domain/settings";
import { isErrno } from "./isErrno";

const CONFIG_FILE = "orchestrator.config.json";
const SETTINGS_FILE = "settings.json";

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
    if (isErrno(error, "ENOENT")) return {};
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

// Reads <orchestratorDir>/orchestrator.config.json and settings.json (each may
// be missing) and makes the folders absolute. For projectRoot, runtime and
// models the first that is set wins: `overrides` (a flag or an environment
// variable, passed in by the caller), settings.json, the config file, the
// defaults. Relative paths resolve against orchestratorDir, not the current
// directory. `overrides.settingsPath` reads another settings file (tests use a
// missing one). Does not read environment variables itself.
export async function loadConfig(
  orchestratorDir: string,
  overrides: { projectRoot?: string; dataDir?: string; runtime?: string; settingsPath?: string } = {},
): Promise<ResolvedConfig> {
  const configPath = join(orchestratorDir, CONFIG_FILE);
  const rawConfig = await readRaw(configPath);
  const parsed = OrchestratorConfig.safeParse(rawConfig);
  if (!parsed.success) throw new InvalidConfigError(configPath, problemsOf(parsed.error));

  const settingsPath = overrides.settingsPath ? resolve(orchestratorDir, overrides.settingsPath) : join(orchestratorDir, SETTINGS_FILE);
  const settingsParsed = LocalSettings.safeParse(await readRaw(settingsPath));
  if (!settingsParsed.success) throw new InvalidConfigError(settingsPath, problemsOf(settingsParsed.error));
  const settings = settingsParsed.data;
  const inConfig = (key: string) => typeof rawConfig === "object" && rawConfig !== null && key in rawConfig;
  const sourceOf = (override: unknown, fromSettings: unknown, key: string): SettingSource =>
    override !== undefined ? "override" : fromSettings !== undefined ? "settings.json" : inConfig(key) ? "orchestrator.config.json" : "default";

  let runtime = settings.runtime ?? parsed.data.runtime;
  if (overrides.runtime) {
    const kind = RuntimeKind.safeParse(overrides.runtime);
    if (!kind.success) {
      throw new InvalidConfigError(configPath, [{ key: "runtime", message: `"${overrides.runtime}" is not one of ${RuntimeKind.options.join(", ")}` }]);
    }
    runtime = kind.data;
  }
  const models = {
    cursor: settings.models?.cursor ?? parsed.data.models.cursor,
    claude: settings.models?.claude ?? parsed.data.models.claude,
  };
  const sources = {
    projectRoot: sourceOf(overrides.projectRoot, settings.projectRoot, "projectRoot"),
    runtime: sourceOf(overrides.runtime, settings.runtime, "runtime"),
  };

  const projectRoot = resolve(orchestratorDir, overrides.projectRoot ?? settings.projectRoot ?? parsed.data.projectRoot);
  if (!(await isFolder(projectRoot))) {
    const from = sources.projectRoot === "settings.json" ? settingsPath : configPath;
    throw new InvalidConfigError(from, [{ key: "projectRoot", message: `${projectRoot} is not a folder` }]);
  }

  return { ...parsed.data, runtime, models, sources, orchestratorDir, projectRoot, dataDir: resolve(orchestratorDir, overrides.dataDir ?? parsed.data.dataDir) };
}
