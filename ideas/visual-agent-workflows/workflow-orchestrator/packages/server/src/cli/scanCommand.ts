import { InvalidConfigError, type Registry } from "@orch/core";
import { formatRegistry } from "./formatRegistry";

export type ScanDeps = {
  scan(options: { projectRoot?: string }): Promise<Registry>;
  write(text: string): void;
  env: { ORCH_PROJECT_ROOT?: string };
};

export const scanUsage = `usage: npm run scan -- [--project <path>] [--json]

  --project <path>  host project to scan (relative to the orchestrator folder);
                    overrides ORCH_PROJECT_ROOT and orchestrator.config.json
  --json            print the registry as JSON
  --help            show this text
`;

// `npm run scan`: prints the host project's registry. Returns the exit code:
// 0 done, 1 unusable config, 2 bad arguments. Other errors are rethrown.
export async function runScanCommand(argv: string[], deps: ScanDeps): Promise<number> {
  let json = false;
  let project: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      json = true;
    } else if (arg === "--help") {
      deps.write(scanUsage);
      return 0;
    } else if (arg === "--project") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        deps.write(`--project needs a path\n\n${scanUsage}`);
        return 2;
      }
      project = value;
      i++;
    } else {
      deps.write(`unknown option: ${arg}\n\n${scanUsage}`);
      return 2;
    }
  }

  const projectRoot = project ?? deps.env.ORCH_PROJECT_ROOT;
  try {
    const registry = await deps.scan(projectRoot ? { projectRoot } : {});
    deps.write(json ? `${JSON.stringify(registry, null, 2)}\n` : formatRegistry(registry));
    return 0;
  } catch (error) {
    if (!(error instanceof InvalidConfigError)) throw error;
    const lines = error.problems.map((p) => `  ${p.key}: ${p.message}`);
    deps.write(`Invalid config in ${error.configPath}\n${lines.join("\n")}\n`);
    return 1;
  }
}
