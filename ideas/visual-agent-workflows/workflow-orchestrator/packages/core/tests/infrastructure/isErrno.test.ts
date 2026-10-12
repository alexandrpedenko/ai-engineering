import { describe, expect, it } from "vitest";
import { isErrno } from "../../src/infrastructure/isErrno";

describe("isErrno", () => {
  it("matches a system error by code", () => {
    const error = Object.assign(new Error("gone"), { code: "ENOENT" });
    expect(isErrno(error, "ENOENT")).toBe(true);
    expect(isErrno(error, "EACCES", "ELOOP")).toBe(false);
  });

  it("is false for anything without a code", () => {
    expect(isErrno(new Error("x"), "ENOENT")).toBe(false);
    expect(isErrno("ENOENT", "ENOENT")).toBe(false);
    expect(isErrno(null, "ENOENT")).toBe(false);
  });
});
