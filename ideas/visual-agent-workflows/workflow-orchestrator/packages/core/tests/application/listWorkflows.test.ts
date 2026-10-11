import { describe, expect, it } from "vitest";
import { listWorkflows } from "../../src/application/listWorkflows";
import { MemoryWorkflowStore } from "../support/MemoryWorkflowStore";
import { baWorkflow, registry } from "../support/workflows";

describe("listWorkflows", () => {
  it("lists each workflow with its problems, and a broken file with its error", async () => {
    const store = new MemoryWorkflowStore([baWorkflow()]);
    const bad = baWorkflow((w) => Object.assign(w, { id: "bad-agent" }));
    delete (bad as { phase?: string }).phase;
    bad.steps[0] = { ...(bad.steps[0] as object), agent: "ghost" } as never;
    store.workflows.set("bad-agent", bad);
    store.broken.set("broken", "broken.json is not valid JSON");

    expect(await listWorkflows({ store, registry })).toEqual([
      { id: "ba-discovery", name: "BA discovery", phase: "discovery", problems: [] },
      {
        id: "bad-agent",
        name: "BA discovery",
        problems: [
          { severity: "error", stepId: "elicit", message: 'unknown agent "ghost"' },
          { severity: "warning", message: "no phase; the workflow is shown under Unsorted" },
        ],
      },
      { id: "broken", name: "broken", problems: [{ severity: "error", message: "broken.json is not valid JSON" }] },
    ]);
  });
});
