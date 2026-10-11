import { describe, expect, it } from "vitest";
import { parseWorkflow } from "../../src/domain/parseWorkflow";
import { baWorkflowJson } from "../support/workflows";

describe("parseWorkflow", () => {
  it("gives the workflow with its defaults filled in", () => {
    const parsed = parseWorkflow(baWorkflowJson());

    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.workflow.steps[1]).toMatchObject({ type: "gate", maxRevisions: 3 });
  });

  it("names each schema problem by its path", () => {
    const json = baWorkflowJson();
    Object.assign(json.steps[0]!, { id: "Bad Id" });

    const parsed = parseWorkflow(json);

    expect(parsed).toEqual({
      ok: false,
      problems: [{ severity: "error", message: "steps.0.id: use lowercase letters, digits and dashes, starting with a letter" }],
    });
  });

  it("says (body) for a value that isn't an object", () => {
    expect(parseWorkflow("nope")).toMatchObject({ ok: false, problems: [{ message: expect.stringMatching(/^\(body\): /) }] });
  });
});
