import { describe, expect, it } from "vitest";
import { fillTemplate, templateRefs } from "../../src/domain/template";

describe("fillTemplate", () => {
  it("fills inputs, with or without spaces in the braces", () => {
    expect(fillTemplate("Focus: {{inputs.focus}} / {{ inputs.focus }}", { focus: "pricing" })).toBe("Focus: pricing / pricing");
  });

  it("fills a missing value with nothing", () => {
    expect(fillTemplate("Focus: {{inputs.focus}}.", {})).toBe("Focus: .");
  });

  it("leaves other braces alone", () => {
    expect(fillTemplate("{{steps.x}} {x}", {})).toBe("{{steps.x}} {x}");
  });
});

describe("templateRefs", () => {
  it("lists each input id once, in order", () => {
    expect(templateRefs("{{inputs.b}} {{inputs.a}} {{ inputs.b }}")).toEqual(["b", "a"]);
  });
});
