import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ProjectPage } from "../../src/pages/ProjectPage";
import { FakeOrchestratorApi } from "../support/FakeOrchestratorApi";
import { renderPage } from "../support/renderWithProviders";
import { ApiError } from "../../src/domain/apiError";

describe("ProjectPage", () => {
  it("shows skills, agents and artefacts in tabs", async () => {
    renderPage(<ProjectPage />, { path: "/project", at: "/project" });

    expect(await screen.findByText("requirements-elicitation")).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "Agents (2)" }));
    expect(screen.getByText("architect (model: inherit)")).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "Artefacts (1)" }));
    expect(screen.getByText("discovery/brief.md")).toBeTruthy();
  });

  it("shows the files the orchestrator couldn't use", async () => {
    const api = new FakeOrchestratorApi();
    api.registry = { ...api.registry, warnings: [{ path: ".cursor/agents/ba.md", message: "missing description" }] };
    renderPage(<ProjectPage />, { path: "/project", at: "/project", api });

    expect(await screen.findByText("missing description")).toBeTruthy();
  });

  it("opens a skill or an artefact in the editor", async () => {
    renderPage(<ProjectPage />, { path: "/project", at: "/project" });

    await userEvent.click(await screen.findByText("requirements-elicitation"));

    expect(screen.getByTestId("location").textContent).toBe(`/files?path=${encodeURIComponent(".cursor/skills/requirements-elicitation/SKILL.md")}`);
  });

  it("says when the project can't be read", async () => {
    const api = new FakeOrchestratorApi();
    api.failures.project = new ApiError(500, "internal error");
    renderPage(<ProjectPage />, { path: "/project", at: "/project", api });
    expect(await screen.findByText("internal error")).toBeTruthy();
  });
});
