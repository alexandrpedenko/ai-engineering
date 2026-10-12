import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AppRoutes } from "../../src/bootstrap/routes";
import { FakeOrchestratorApi } from "../support/FakeOrchestratorApi";
import { renderWithProviders } from "../support/renderWithProviders";
import { waitingRun } from "../support/sampleData";

function renderAt(path: string) {
  const api = new FakeOrchestratorApi();
  api.runsById["run-1"] = waitingRun();
  api.changes["run-1/review"] = [];
  renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
    api,
  );
}

describe("AppRoutes", () => {
  it("sends / to the project page", async () => {
    renderAt("/");
    expect(await screen.findByRole("tab", { name: /Skills/ })).toBeTruthy();
  });

  it("shows the runs list, a run and a workflow at their addresses", async () => {
    renderAt("/runs");
    expect(await screen.findByText("No runs yet.")).toBeTruthy();
  });

  it("shows a run", async () => {
    renderAt("/runs/run-1");
    expect(await screen.findByText("waiting for review")).toBeTruthy();
  });

  it("shows a workflow", async () => {
    renderAt("/workflows/ba-discovery");
    expect(await screen.findByRole("button", { name: /Start run/ })).toBeTruthy();
  });

  it("says when an address is unknown", async () => {
    renderAt("/nowhere");
    expect(await screen.findByText(/not found|No page/i)).toBeTruthy();
  });
});
