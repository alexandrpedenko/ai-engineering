import { describe, expect, it } from "vitest";
import { ApiError, isNotFound } from "../../src/domain/apiError";

describe("ApiError", () => {
  it("keeps the status, message and problems", () => {
    const error = new ApiError(400, "can't run", [{ severity: "error", message: "unknown agent" }]);
    expect(error).toBeInstanceOf(Error);
    expect([error.status, error.message, error.problems.length]).toEqual([400, "can't run", 1]);
  });

  it("isNotFound is true only for a 404 ApiError", () => {
    expect(isNotFound(new ApiError(404, "no run"))).toBe(true);
    expect(isNotFound(new ApiError(400, "bad"))).toBe(false);
    expect(isNotFound(new Error("404"))).toBe(false);
  });
});
