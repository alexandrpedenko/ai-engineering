import { describe, expect, it } from "vitest";
import { DEFAULT_PHASES } from "../../src/domain/phase";
import { hasErrors, validate, type Problem } from "../../src/domain/validate";
import { baWorkflow, registry } from "../support/workflows";

const context = { registry, phases: DEFAULT_PHASES };
const errors = (problems: Problem[]) => problems.filter((p) => p.severity === "error");

describe("validate", () => {
  it("finds nothing wrong with the BA workflow", () => {
    expect(validate(baWorkflow(), context)).toEqual([]);
  });

  it("reports two steps with the same id", () => {
    const workflow = baWorkflow((w) => {
      w.steps.push({ ...w.steps[0]!, label: "again" } as never);
    });
    expect(errors(validate(workflow, context))).toContainEqual({ severity: "error", stepId: "elicit", message: 'two steps have the id "elicit"' });
  });

  it("reports an unknown agent and each unknown skill", () => {
    const workflow = baWorkflow((w) => {
      Object.assign(w.steps[0]!, { agent: "ghost", skills: ["requirements-elicitation", "nope", "nada"] });
    });
    expect(errors(validate(workflow, context)).map((p) => p.message)).toEqual([
      'unknown agent "ghost"',
      'unknown skill "nope"',
      'unknown skill "nada"',
    ]);
  });

  it("reports an input the instructions use but the workflow doesn't declare", () => {
    const workflow = baWorkflow((w) => {
      w.inputs = [];
    });
    expect(errors(validate(workflow, context))).toEqual([
      { severity: "error", stepId: "elicit", message: 'instructions use {{inputs.focus}}, but the workflow has no input "focus"' },
    ]);
  });

  it("reports an edge to a missing step", () => {
    const workflow = baWorkflow((w) => {
      w.edges.push({ from: "design", to: "ship" });
    });
    expect(errors(validate(workflow, context))).toContainEqual({
      severity: "error",
      message: 'edge design → ship points to a missing step "ship"',
    });
  });

  it("reports no start step when every step has an incoming edge", () => {
    const workflow = baWorkflow((w) => {
      w.edges.push({ from: "design", to: "elicit" });
    });
    const messages = errors(validate(workflow, context)).map((p) => p.message);
    expect(messages).toContain("no start step: every step has an incoming edge");
    expect(messages).toContain('"elicit" is on a loop of edges; loops go through a gate\'s onReject instead');
  });

  it("reports every start step when there are several", () => {
    const workflow = baWorkflow((w) => {
      w.edges = [{ from: "elicit", to: "review" }];
    });
    expect(errors(validate(workflow, context)).filter((p) => p.message.includes("start steps")).map((p) => p.stepId)).toEqual([
      "elicit",
      "design",
    ]);
  });

  it("reports a step with two next steps", () => {
    const workflow = baWorkflow((w) => {
      w.edges.push({ from: "elicit", to: "design" });
    });
    expect(errors(validate(workflow, context))).toContainEqual({
      severity: "error",
      stepId: "elicit",
      message: '"elicit" has 2 next steps; branching isn\'t supported yet',
    });
  });

  it("reports a loop of edges that isn't the start", () => {
    const workflow = baWorkflow((w) => {
      w.edges.push({ from: "design", to: "review" });
    });
    expect(errors(validate(workflow, context)).map((p) => p.stepId)).toContain("review");
  });

  it("reports a step that can't be reached from the start", () => {
    const workflow = baWorkflow((w) => {
      w.steps.push({ ...w.steps[2]!, id: "island" } as never);
      w.edges.push({ from: "island", to: "island" });
    });
    expect(errors(validate(workflow, context))).toContainEqual({
      severity: "error",
      stepId: "island",
      message: '"island" can\'t be reached from the start step "elicit"',
    });
  });

  it("reports a gate that rejects to a missing step, a gate, or a later step", () => {
    const missing = baWorkflow((w) => Object.assign(w.steps[1]!, { onReject: "ghost" }));
    const gate = baWorkflow((w) => Object.assign(w.steps[1]!, { onReject: "review" }));
    const later = baWorkflow((w) => Object.assign(w.steps[1]!, { onReject: "design" }));

    expect(errors(validate(missing, context))[0]?.message).toBe('"review" sends rejections to "ghost", which doesn\'t exist');
    expect(errors(validate(gate, context))[0]?.message).toBe('"review" sends rejections to "review", which is not an agent step');
    expect(errors(validate(later, context))[0]?.message).toBe('"review" sends rejections to "design", which isn\'t before it');
  });

  it("accepts an agent step that names no files to write", () => {
    const workflow = baWorkflow((w) => Object.assign(w.steps[2]!, { writes: [] }));
    expect(validate(workflow, context)).toEqual([]);
  });

  it("warns about a missing or unknown phase without making it an error", () => {
    const none = validate(baWorkflow((w) => delete (w as { phase?: string }).phase), context);
    const unknown = validate(baWorkflow((w) => Object.assign(w, { phase: "testing" })), context);

    expect(none).toEqual([{ severity: "warning", message: "no phase; the workflow is shown under Unsorted" }]);
    expect(unknown[0]?.message).toBe('phase "testing" is not in phases.json; the workflow is shown under Unsorted');
    expect(hasErrors(none)).toBe(false);
  });
});

describe("hasErrors", () => {
  it("is true only when some problem is an error", () => {
    expect(hasErrors([])).toBe(false);
    expect(hasErrors([{ severity: "warning", message: "w" }])).toBe(false);
    expect(hasErrors([{ severity: "warning", message: "w" }, { severity: "error", message: "e" }])).toBe(true);
  });
});
