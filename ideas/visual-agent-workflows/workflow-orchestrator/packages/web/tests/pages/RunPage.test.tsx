import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useGateDraftStore } from "../../src/application/useGateDraftStore";
import { RunPage } from "../../src/pages/RunPage";
import { FakeOrchestratorApi } from "../support/FakeOrchestratorApi";
import { renderPage } from "../support/renderWithProviders";
import { record, runDetails, runState, waitingRun } from "../support/sampleData";

beforeEach(() => {
  useGateDraftStore.setState({ drafts: {} });
});

function render(details = waitingRun()) {
  const api = new FakeOrchestratorApi();
  api.runsById["run-1"] = details;
  api.files["discovery/requirements.md"] = "# Requirements\nR1 Members can book a room.";
  renderPage(<RunPage />, { path: "/runs/:runId", at: "/runs/run-1", api });
  return api;
}

describe("RunPage at a gate", () => {
  it("shows the steps and the file to review", async () => {
    render();

    expect(await screen.findByText("BA discovery")).toBeTruthy();
    expect(within(screen.getByLabelText("step elicit")).getByText("done")).toBeTruthy();
    expect(within(screen.getByLabelText("step review")).getByText("waiting for review")).toBeTruthy();
    expect(within(screen.getByLabelText("step design")).getByText("not started")).toBeTruthy();
    expect(await screen.findByText(/R1 Members can book a room/)).toBeTruthy();
  });

  it("approves", async () => {
    const api = render();
    await userEvent.click(await screen.findByRole("button", { name: "Approve" }));
    expect(api.calls).toContain("resume run-1 approve");
  });

  it("rejects only with feedback, and sends it", async () => {
    const api = render();
    const reject = await screen.findByRole("button", { name: "Reject" });
    expect(reject).toHaveProperty("disabled", true);

    await userEvent.type(screen.getByLabelText("Feedback (needed to reject)"), "Add acceptance checks");
    await userEvent.click(reject);

    expect(api.calls).toContain("resume run-1 reject:Add acceptance checks");
  });

  it("says when a gate's file doesn't exist", async () => {
    const api = new FakeOrchestratorApi();
    api.runsById["run-1"] = waitingRun();
    renderPage(<RunPage />, { path: "/runs/:runId", at: "/runs/run-1", api });
    expect(await screen.findByText("File not found.")).toBeTruthy();
  });
});

describe("RunPage while running", () => {
  it("shows the agent's live feed under the running step, and a Cancel button", async () => {
    const api = render(runDetails(null, { busy: true }));
    await screen.findByText("BA discovery");

    act(() => {
      api.emit("run-1", 1, { type: "step-started", stepId: "elicit", attempt: 1 });
      api.emit("run-1", 2, { type: "agent-event", stepId: "elicit", event: { kind: "text", text: "Reading the brief" } });
    });

    expect(within(screen.getByLabelText("step elicit")).getByText("running")).toBeTruthy();
    expect(screen.getByText(/Reading the brief/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.calls).toContain("cancel run-1");
  });

  it("moves to finished when the run settles", async () => {
    const api = render();
    await screen.findByText("BA discovery");

    const state = runState({ steps: { elicit: record(), design: record() }, decisions: { review: [{ decision: "approve" }] } });
    act(() => api.emit("run-1", 9, { type: "run-settled", outcome: { status: "finished", state } }));

    expect(await screen.findByText("Finished.")).toBeTruthy();
    expect(within(screen.getByLabelText("step review")).getByText("approved")).toBeTruthy();
  });
});

describe("RunPage outcomes", () => {
  it("offers Continue for an interrupted run", async () => {
    const api = render(runDetails({ status: "interrupted", stepId: "design", state: runState() }));
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(api.calls).toContain("continue run-1");
  });

  it("shows why a run failed", async () => {
    render(runDetails({ status: "failed", stepId: "elicit", state: runState({ steps: { elicit: record({ status: "failed", summary: "rate limited" }) } }) }));
    expect(await screen.findByText("Failed at elicit: rate limited")).toBeTruthy();
  });

  it("says so for an unknown run", async () => {
    renderPage(<RunPage />, { path: "/runs/:runId", at: "/runs/nope" });
    expect(await screen.findByText('No run "nope".')).toBeTruthy();
  });
});
