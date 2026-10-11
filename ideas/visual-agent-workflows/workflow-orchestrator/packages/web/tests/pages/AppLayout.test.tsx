import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppLayout } from "../../src/pages/AppLayout";
import { FakeOrchestratorApi } from "../support/FakeOrchestratorApi";
import { renderPage } from "../support/renderWithProviders";

const render = (api = new FakeOrchestratorApi()) => renderPage(<AppLayout />, { path: "/project", at: "/project", api });

describe("AppLayout", () => {
  it("shows the project name and the server status", async () => {
    render();
    expect(await screen.findByText("sample-project")).toBeTruthy();
    expect(await screen.findByText("server: up")).toBeTruthy();
  });

  it("lists the phases in order with their workflows, and no Unsorted group when not needed", async () => {
    render();
    const discovery = await screen.findByRole("group", { name: "Discovery" });
    expect(within(discovery).getByText("BA discovery")).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Delivery" })).getByText("No workflows yet")).toBeTruthy();
    const groups = screen.getAllByRole("group").map((g) => g.getAttribute("aria-label"));
    expect(groups).toEqual(["Discovery", "Delivery"]);
  });

  it("marks a workflow with errors, and shows Unsorted for one without a known phase", async () => {
    const api = new FakeOrchestratorApi();
    api.workflowList = [
      { id: "ba-discovery", name: "BA discovery", phase: "discovery", problems: [{ severity: "error", message: "x" }] },
      { id: "loose", name: "Loose", problems: [{ severity: "warning", message: "no phase" }] },
    ];
    render(api);

    expect(await screen.findByLabelText("has errors")).toBeTruthy();
    const unsorted = await screen.findByRole("group", { name: "Unsorted" });
    expect(within(unsorted).getByText("Loose")).toBeTruthy();
    expect(within(unsorted).getByLabelText("has warnings")).toBeTruthy();
  });

  it("counts runs waiting at a gate", async () => {
    const api = new FakeOrchestratorApi();
    api.runList = [
      { runId: "r1", workflowId: "ba-discovery", startedAt: "", status: "waiting", busy: false },
      { runId: "r2", workflowId: "ba-discovery", startedAt: "", status: "finished", busy: false },
    ];
    render(api);
    expect(await screen.findByLabelText("1 waiting")).toBeTruthy();
  });

  it("navigates when a workflow is clicked", async () => {
    render();
    await userEvent.click(await screen.findByText("BA discovery"));
    expect(screen.getByTestId("location").textContent).toBe("/workflows/ba-discovery");
  });
});
