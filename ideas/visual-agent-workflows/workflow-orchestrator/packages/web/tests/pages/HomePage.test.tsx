import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomePage } from "../../src/pages/HomePage";
import { FakeOrchestratorApi } from "../support/FakeOrchestratorApi";
import { renderWithProviders } from "../support/renderWithProviders";

describe("HomePage", () => {
  it("shows the title and the server status", async () => {
    renderWithProviders(<HomePage />);

    expect(screen.getByText("Workflow orchestrator")).toBeTruthy();
    expect(await screen.findByText("server: up")).toBeTruthy();
  });

  it("shows the server as down when it does not answer", async () => {
    const api = new FakeOrchestratorApi();
    api.serverUp = new Error("connection refused");

    renderWithProviders(<HomePage />, api);

    expect(await screen.findByText("server: down")).toBeTruthy();
  });
});
