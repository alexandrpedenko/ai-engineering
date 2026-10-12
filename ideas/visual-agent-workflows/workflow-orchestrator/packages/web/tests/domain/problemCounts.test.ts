import { describe, expect, it } from "vitest";
import { problemCounts } from "../../src/domain/problemCounts";

describe("problemCounts", () => {
  it("counts errors and warnings", () => {
    expect(problemCounts([])).toEqual({ errors: 0, warnings: 0 });
    expect(
      problemCounts([
        { severity: "error", message: "a" },
        { severity: "warning", message: "b" },
        { severity: "error", message: "c" },
      ]),
    ).toEqual({ errors: 2, warnings: 1 });
  });
});
