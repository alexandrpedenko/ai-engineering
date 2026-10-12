import { describe, expect, it } from "vitest";
import { assertRunId } from "../../src/domain/runId";

describe("assertRunId", () => {
  it("accepts letters, digits, _ and -", () => {
    expect(() => assertRunId("run-ab12_CD")).not.toThrow();
  });

  it.each(["../etc", "a/b", "", "run 1", "run.1"])("refuses %j", (runId) => {
    expect(() => assertRunId(runId)).toThrow("invalid run id");
  });
});
