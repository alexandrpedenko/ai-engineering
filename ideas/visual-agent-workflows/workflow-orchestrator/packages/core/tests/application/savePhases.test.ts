import { describe, expect, it } from "vitest";
import { InvalidInputError } from "../../src/application/errors";
import { savePhases } from "../../src/application/savePhases";
import { MemoryWorkflowStore } from "../support/MemoryWorkflowStore";

describe("savePhases", () => {
  it("saves a valid phases file", async () => {
    const store = new MemoryWorkflowStore();
    await savePhases(store, { phases: [{ id: "discovery", name: "Discovery", order: 1 }] });
    expect(store.savedPhases).toEqual([{ id: "discovery", name: "Discovery", order: 1 }]);
  });

  it("refuses a malformed body and repeated ids", async () => {
    const store = new MemoryWorkflowStore();
    await expect(savePhases(store, { phases: [{ id: "x" }] })).rejects.toBeInstanceOf(InvalidInputError);
    await expect(
      savePhases(store, { phases: [{ id: "a", name: "A", order: 1 }, { id: "a", name: "B", order: 2 }] }),
    ).rejects.toThrow("phase ids must be unique; repeated: a");
    expect(store.savedPhases).toBeNull();
  });
});
