import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/domain/apiError";
import { RunsPage } from "../../src/pages/RunsPage";
import { FakeOrchestratorApi } from "../support/FakeOrchestratorApi";
import { renderPage } from "../support/renderWithProviders";

describe("RunsPage", () => {
  it("lists runs and opens one", async () => {
    const api = new FakeOrchestratorApi();
    api.runList = [{ runId: "run-7", workflowId: "ba-discovery", startedAt: "", status: "finished", busy: false }];
    renderPage(<RunsPage />, { path: "/runs", at: "/runs", api });

    await userEvent.click(await screen.findByText("run-7"));

    expect(screen.getByTestId("location").textContent).toBe("/runs/run-7");
  });

  it("says when there are no runs", async () => {
    renderPage(<RunsPage />, { path: "/runs", at: "/runs" });
    expect(await screen.findByText("No runs yet.")).toBeTruthy();
  });

  it("says when the runs can't be loaded", async () => {
    const api = new FakeOrchestratorApi();
    api.failures.runs = new ApiError(500, "internal error");
    renderPage(<RunsPage />, { path: "/runs", at: "/runs", api });
    expect(await screen.findByText("internal error")).toBeTruthy();
  });

  it("shows when each run started", async () => {
    const api = new FakeOrchestratorApi();
    api.runList = [{ runId: "run-7", workflowId: "ba-discovery", startedAt: "not a date", status: "finished", busy: false }];
    renderPage(<RunsPage />, { path: "/runs", at: "/runs", api });
    expect(await screen.findByText("—")).toBeTruthy();
  });
});
