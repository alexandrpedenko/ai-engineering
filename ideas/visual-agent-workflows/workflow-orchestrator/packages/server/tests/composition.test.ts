import { describe, expect, it } from "vitest";
import { createProjectServices } from "../src/composition";

describe("createProjectServices", () => {
  it("scans the sample project on the real file system", async () => {
    const services = await createProjectServices({ projectRoot: "fixtures/sample-project" });

    const registry = await services.scan();

    expect(registry.root).toBe(services.config.projectRoot);
    expect(registry.skills.map((s) => s.name)).toEqual(["architecture-review", "requirements-elicitation"]);
    expect(registry.agents.map((a) => a.name)).toEqual(["architect", "business-analyst"]);
    expect(registry.agents[0]?.model).toBe("inherit");
    expect(registry.artefacts.map((a) => a.path)).toEqual(["discovery/brief.md", "wiki/README.md"]);
    expect(registry.warnings).toEqual([]);
  });
});
