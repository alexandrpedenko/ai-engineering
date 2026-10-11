import { InvalidConfigError, type Registry } from "@orch/core";
import { describe, expect, it } from "vitest";
import { runScanCommand, type ScanDeps } from "../../src/cli/scanCommand";

const registry: Registry = { root: "/host", skills: [], agents: [], artefacts: [], warnings: [] };

// Deps that record what the command asked for and wrote.
function fakeDeps(options: { env?: ScanDeps["env"]; fail?: Error } = {}) {
  const calls: { projectRoot?: string }[] = [];
  let output = "";
  const deps: ScanDeps = {
    scan: async (scanOptions) => {
      calls.push(scanOptions);
      if (options.fail) throw options.fail;
      return registry;
    },
    write: (text) => {
      output += text;
    },
    env: options.env ?? {},
  };
  return { deps, calls, output: () => output };
}

describe("runScanCommand", () => {
  it("prints the registry as text by default", async () => {
    const { deps, output } = fakeDeps();
    expect(await runScanCommand([], deps)).toBe(0);
    expect(output()).toMatch(/^project {4}\/host\n/);
  });

  it("prints JSON with --json", async () => {
    const { deps, output } = fakeDeps();
    expect(await runScanCommand(["--json"], deps)).toBe(0);
    expect(JSON.parse(output())).toEqual(registry);
  });

  it("passes --project, which beats ORCH_PROJECT_ROOT", async () => {
    const { deps, calls } = fakeDeps({ env: { ORCH_PROJECT_ROOT: "from-env" } });
    await runScanCommand(["--project", "from-flag"], deps);
    expect(calls).toEqual([{ projectRoot: "from-flag" }]);
  });

  it("uses ORCH_PROJECT_ROOT without --project, and nothing without either", async () => {
    const withEnv = fakeDeps({ env: { ORCH_PROJECT_ROOT: "from-env" } });
    await runScanCommand([], withEnv.deps);
    expect(withEnv.calls).toEqual([{ projectRoot: "from-env" }]);

    const without = fakeDeps();
    await runScanCommand([], without.deps);
    expect(without.calls).toEqual([{}]);
  });

  it("exits 2 with usage on an unknown option or a missing --project value", async () => {
    const unknown = fakeDeps();
    expect(await runScanCommand(["--bogus"], unknown.deps)).toBe(2);
    expect(unknown.output()).toMatch(/^unknown option: --bogus\n\nusage:/);
    expect(unknown.calls).toEqual([]);

    const missing = fakeDeps();
    expect(await runScanCommand(["--project"], missing.deps)).toBe(2);
    expect(missing.output()).toMatch(/^--project needs a path/);
  });

  it("exits 1 naming each bad key when the config can't be used", async () => {
    const error = new InvalidConfigError("/o/orchestrator.config.json", [{ key: "projectRoot", message: "/x is not a folder" }]);
    const { deps, output } = fakeDeps({ fail: error });

    expect(await runScanCommand([], deps)).toBe(1);
    expect(output()).toBe("Invalid config in /o/orchestrator.config.json\n  projectRoot: /x is not a folder\n");
  });

  it("rethrows any other error", async () => {
    const { deps } = fakeDeps({ fail: new Error("disk on fire") });
    await expect(runScanCommand([], deps)).rejects.toThrow("disk on fire");
  });
});
