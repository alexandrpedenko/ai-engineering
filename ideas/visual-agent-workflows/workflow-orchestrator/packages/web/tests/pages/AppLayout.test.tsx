import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useWorkflowDraftStore } from "../../src/application/useWorkflowDraftStore";
import { AppLayout } from "../../src/pages/AppLayout";
import { FakeOrchestratorApi } from "../support/FakeOrchestratorApi";
import { renderPage } from "../support/renderWithProviders";
import { workflow } from "../support/sampleData";

const render = (api = new FakeOrchestratorApi()) => renderPage(<AppLayout />, { path: "/project", at: "/project", api });

beforeEach(() => {
  useWorkflowDraftStore.setState({ drafts: {}, selected: {} });
});

describe("AppLayout", () => {
  it("shows the project name and the server status", async () => {
    render();
    expect(await screen.findByText("sample-project")).toBeTruthy();
    expect(await screen.findByText("server: up · runtime: fake")).toBeTruthy();
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
      { id: "ba-discovery", name: "BA discovery", phase: "discovery", agents: [], skills: [], problems: [{ severity: "error", message: "x" }] },
      { id: "loose", name: "Loose", agents: [], skills: [], problems: [{ severity: "warning", message: "no phase" }] },
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

describe("AppLayout new workflow", () => {
  it("creates a workflow in the phase it was asked from and opens the editor", async () => {
    const api = new FakeOrchestratorApi();
    render(api);
    const delivery = await screen.findByRole("group", { name: "Delivery" });

    await userEvent.click(within(delivery).getByText("+ New workflow"));
    const dialog = await screen.findByRole("dialog", { name: "New workflow in Delivery" });
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Name" }), "Ship it");
    expect(within(dialog).getByRole("textbox", { name: "Id" })).toHaveProperty("value", "ship-it");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    expect(await screen.findByTestId("location")).toHaveProperty("textContent", "/workflows/ship-it/edit");
    expect(api.calls).toEqual(["create ship-it"]);
    expect(api.saved[0]).toMatchObject({ id: "ship-it", name: "Ship it", phase: "delivery", steps: [{ id: "step-1", type: "agent" }] });
  });

  it("refuses an id that is taken before asking the server", async () => {
    const api = new FakeOrchestratorApi();
    render(api);

    await userEvent.click(within(await screen.findByRole("group", { name: "Discovery" })).getByText("+ New workflow"));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Name" }), "BA discovery");

    expect(within(dialog).getByText('a workflow "ba-discovery" already exists')).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Create" })).toHaveProperty("disabled", true);
    expect(api.calls).toEqual([]);
  });

  it("shows the server's refusal in the dialog", async () => {
    const api = new FakeOrchestratorApi();
    api.failures.createWorkflow = new Error("disk full");
    render(api);

    await userEvent.click(within(await screen.findByRole("group", { name: "Discovery" })).getByText("+ New workflow"));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Name" }), "Fresh");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    expect(await within(dialog).findByText("disk full")).toBeTruthy();
    expect(screen.queryByTestId("location")).toBeNull();
  });

  it("marks a workflow that has unsaved edits", async () => {
    useWorkflowDraftStore.getState().setDraft("ba-discovery", workflow);
    render();

    const discovery = await screen.findByRole("group", { name: "Discovery" });
    expect(within(discovery).getByLabelText("unsaved changes")).toBeTruthy();
  });
});
