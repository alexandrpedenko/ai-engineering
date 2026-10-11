import { describe, expect, it } from "vitest";
import { DEFAULT_PHASES, PhasesFile } from "../../src/domain/phase";

describe("PhasesFile", () => {
  it("parses a phases file", () => {
    const file = PhasesFile.parse({ phases: [{ id: "knowledge", name: "Knowledge base", order: 2 }] });
    expect(file.phases[0]?.name).toBe("Knowledge base");
  });

  it("rejects a phase without a name", () => {
    expect(PhasesFile.safeParse({ phases: [{ id: "x", order: 1 }] }).success).toBe(false);
  });

  it("defaults to discovery then delivery", () => {
    expect(DEFAULT_PHASES.map((p) => p.id)).toEqual(["discovery", "delivery"]);
  });
});
