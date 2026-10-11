import { OrchestratorConfig, type ResolvedConfig } from "@orch/core";
import { describe, expect, it } from "vitest";
import { describeSetup } from "../src/composition";

const config = (over: Partial<ResolvedConfig> = {}): ResolvedConfig => ({
  ...OrchestratorConfig.parse({}),
  orchestratorDir: "/o",
  projectRoot: "/code/booking",
  dataDir: "/o/.data",
  ...over,
});

describe("describeSetup", () => {
  it("names the project, the runtime, and where each came from", () => {
    const line = describeSetup(config({ runtime: "claude", sources: { projectRoot: "settings.json", runtime: "override" } }), false);
    expect(line).toBe("project /code/booking (settings.json) · runtime claude (flag or environment)");
  });

  it("says fake agent when running on the fake", () => {
    expect(describeSetup(config(), true)).toBe("project /code/booking (default) · fake agent");
  });
});
