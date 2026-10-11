import { describe, expect, it } from "vitest";
import { LocalSettings } from "../../src/domain/settings";

describe("LocalSettings", () => {
  it("accepts the three keys, and nothing at all", () => {
    expect(LocalSettings.parse({ projectRoot: "/code/app", runtime: "claude", models: { claude: "claude-sonnet-5-5" } })).toEqual({
      projectRoot: "/code/app",
      runtime: "claude",
      models: { claude: "claude-sonnet-5-5" },
    });
    expect(LocalSettings.parse({})).toEqual({});
  });

  it("rejects other keys, an unknown runtime and an empty path", () => {
    expect(LocalSettings.safeParse({ skillDirs: [] }).success).toBe(false);
    expect(LocalSettings.safeParse({ runtime: "gemini" }).success).toBe(false);
    expect(LocalSettings.safeParse({ projectRoot: "" }).success).toBe(false);
  });
});
