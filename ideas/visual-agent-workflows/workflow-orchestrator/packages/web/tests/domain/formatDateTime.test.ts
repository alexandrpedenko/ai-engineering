import { describe, expect, it } from "vitest";
import { formatDateTime } from "../../src/domain/formatDateTime";

describe("formatDateTime", () => {
  it("formats a time as a medium date and a short time", () => {
    expect(formatDateTime("2026-10-12T08:15:00.000Z", "en-GB", "UTC")).toBe("12 Oct 2026, 08:15");
  });

  it("gives a dash for an empty or unreadable time", () => {
    expect(formatDateTime("")).toBe("—");
    expect(formatDateTime("not a date")).toBe("—");
  });
});
