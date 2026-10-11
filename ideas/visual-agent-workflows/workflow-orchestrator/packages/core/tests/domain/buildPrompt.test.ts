import { describe, expect, it } from "vitest";
import { buildPrompt, resolveModel } from "../../src/domain/buildPrompt";
import type { AgentStep } from "../../src/domain/workflow";
import { baWorkflow, registry } from "../support/workflows";

const elicit = baWorkflow().steps[0] as AgentStep;
const [ba, architect] = registry.agents as [(typeof registry.agents)[0], (typeof registry.agents)[0]];
const [skill] = registry.skills as [(typeof registry.skills)[0]];

describe("buildPrompt", () => {
  it("writes every section in order", () => {
    const message = buildPrompt({
      step: elicit,
      agent: ba,
      skills: [skill],
      inputs: { focus: "pricing" },
      feedback: ["add acceptance checks", "split R3"],
      doNotTouch: ["workflow-orchestrator/"],
    });

    expect(message).toBe(
      [
        "# Your role",
        "You are a business analyst.",
        "",
        "# Skills to follow",
        "## requirements-elicitation",
        "Number every requirement.",
        "",
        "# Task",
        "Turn discovery/brief.md into requirements. Focus: pricing",
        "",
        "# Read first",
        "- discovery/brief.md",
        "",
        "# You must write",
        "- discovery/requirements.md",
        "",
        "# Reviewer feedback on your previous attempt",
        "1. add acceptance checks",
        "2. split R3",
        "",
        "# Rules",
        "- Do not change anything in: workflow-orchestrator/",
        "",
      ].join("\n"),
    );
  });

  it("leaves out empty sections", () => {
    const step: AgentStep = { ...elicit, reads: [], writes: [], instructions: "Do it." };
    const message = buildPrompt({ step, agent: { ...ba, body: "" }, skills: [], inputs: {}, feedback: [], doNotTouch: [] });

    expect(message).toBe("# Task\nDo it.\n");
  });
});

describe("resolveModel", () => {
  const fallback = { id: "composer-2.5" };

  it("prefers the step's model", () => {
    expect(resolveModel({ ...elicit, model: "fast-one" }, { ...ba, model: "agent-one" }, fallback)).toEqual({ id: "fast-one" });
  });

  it("uses the agent's model next", () => {
    expect(resolveModel(elicit, { ...ba, model: "agent-one" }, fallback)).toEqual({ id: "agent-one" });
  });

  it("treats inherit and no model as the default", () => {
    expect(resolveModel(elicit, architect, fallback)).toEqual(fallback);
    expect(resolveModel(elicit, ba, fallback)).toEqual(fallback);
  });
});
