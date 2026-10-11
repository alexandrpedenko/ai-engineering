import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { WorkflowPage } from "../../src/pages/WorkflowPage";
import { FakeOrchestratorApi } from "../support/FakeOrchestratorApi";
import { renderPage } from "../support/renderWithProviders";
import { workflow } from "../support/sampleData";

const render = (api = new FakeOrchestratorApi(), id = "ba-discovery") =>
  renderPage(<WorkflowPage />, { path: "/workflows/:id", at: `/workflows/${id}`, api });

describe("WorkflowPage", () => {
  it("shows the workflow's phase and steps", async () => {
    render();
    expect(await screen.findByText("BA discovery")).toBeTruthy();
    expect(screen.getByText("phase: Discovery")).toBeTruthy();
    expect(screen.getByText("1. Write requirements")).toBeTruthy();
    expect(screen.getByText("3. Sketch the design")).toBeTruthy();
  });

  it("goes to the editor", async () => {
    render();
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByTestId("location").textContent).toBe("/workflows/ba-discovery/edit");
  });

  it("starts a run with the inputs and goes to it", async () => {
    const api = new FakeOrchestratorApi();
    render(api);

    await userEvent.type(await screen.findByLabelText("What to focus on"), "pricing");
    await userEvent.click(screen.getByRole("button", { name: "Start run" }));

    expect(await screen.findByTestId("location")).toHaveProperty("textContent", "/runs/run-new");
    expect(api.calls).toEqual(['start ba-discovery {"focus":"pricing"}']);
  });

  it("won't start a workflow with errors and shows them", async () => {
    const api = new FakeOrchestratorApi();
    api.workflowsById["ba-discovery"] = { workflow, problems: [{ severity: "error", stepId: "elicit", message: 'unknown agent "ghost"' }] };
    render(api);

    expect(await screen.findByText('unknown agent "ghost"')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start run" })).toHaveProperty("disabled", true);
  });

  it("lists this workflow's runs", async () => {
    const api = new FakeOrchestratorApi();
    api.runList = [{ runId: "run-7", workflowId: "ba-discovery", startedAt: "2026-10-11T12:00:00.000Z", status: "waiting", busy: false }];
    render(api);

    expect(await screen.findByText("run-7")).toBeTruthy();
    expect(screen.getByText("waiting at gate")).toBeTruthy();
  });

  it("says so for an unknown workflow", async () => {
    render(new FakeOrchestratorApi(), "nope");
    expect(await screen.findByText('No workflow "nope".')).toBeTruthy();
  });
});
