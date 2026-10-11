import { describe, expect, it } from "vitest";
import { InvalidConfigError } from "../../src/application/errors";

describe("InvalidConfigError", () => {
  it("carries the config path and names every bad key in its message", () => {
    const error = new InvalidConfigError("/o/orchestrator.config.json", [
      { key: "skilDirs", message: "unknown key" },
      { key: "projectRoot", message: "/x is not a folder" },
    ]);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("InvalidConfigError");
    expect(error.configPath).toBe("/o/orchestrator.config.json");
    expect(error.problems).toHaveLength(2);
    expect(error.message).toBe(
      "Invalid orchestrator config (/o/orchestrator.config.json): skilDirs: unknown key; projectRoot: /x is not a folder",
    );
  });
});
