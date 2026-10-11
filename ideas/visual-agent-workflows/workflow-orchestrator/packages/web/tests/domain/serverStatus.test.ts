import { describe, expect, it } from "vitest";
import { toServerStatus } from "../../src/domain/serverStatus";

describe("toServerStatus", () => {
  it("is checking while the request runs", () => {
    expect(toServerStatus({ isPending: true, isError: false })).toBe("checking");
  });

  it("is down on an error", () => {
    expect(toServerStatus({ isPending: false, isError: true })).toBe("down");
  });

  it("follows the answer otherwise", () => {
    expect(toServerStatus({ isPending: false, isError: false, up: true })).toBe("up");
    expect(toServerStatus({ isPending: false, isError: false, up: false })).toBe("down");
  });
});
