import { InvalidConfigError } from "@orch/core";
import { describe, expect, it } from "vitest";
import { formatConfigError } from "../../src/cli/formatConfigError";

describe("formatConfigError", () => {
  it("names the file and each wrong key", () => {
    const error = new InvalidConfigError("/o/settings.json", [
      { key: "projectRoot", message: "no such folder" },
      { key: "runtime", message: "must be cursor or claude" },
    ]);
    expect(formatConfigError(error)).toBe("Invalid config in /o/settings.json\n  projectRoot: no such folder\n  runtime: must be cursor or claude\n");
  });
});
