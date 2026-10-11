// orchestrator.config.json can't be used: bad JSON, a bad key, or a project
// root that doesn't exist. `problems` names each key that is wrong.
export class InvalidConfigError extends Error {
  readonly configPath: string;
  readonly problems: { key: string; message: string }[];

  constructor(configPath: string, problems: { key: string; message: string }[]) {
    super(`Invalid orchestrator config (${configPath}): ${problems.map((p) => `${p.key}: ${p.message}`).join("; ")}`);
    this.name = "InvalidConfigError";
    this.configPath = configPath;
    this.problems = problems;
  }
}
