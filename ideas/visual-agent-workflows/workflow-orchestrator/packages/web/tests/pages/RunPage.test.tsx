import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FileChanges, RunOutcome } from "@orch/core";
import { beforeEach, describe, expect, it } from "vitest";
import { useGateDraftStore } from "../../src/application/useGateDraftStore";
import { RunPage } from "../../src/pages/RunPage";
import { FakeOrchestratorApi } from "../support/FakeOrchestratorApi";
import { renderPage } from "../support/renderWithProviders";
import { record, runDetails, runState, waitingRun } from "../support/sampleData";

beforeEach(() => {
  useGateDraftStore.setState({ drafts: {} });
});

const requirementsDiff = "@@ -1,2 +1,3 @@\n # Requirements\n-R1 Members can book.\n+R1 Members can book a room.\n+R2 Members can cancel.\n";

function render(details = waitingRun(), changes: FileChanges = [{ path: "discovery/requirements.md", change: "modified", added: 2, removed: 1, diff: requirementsDiff }]) {
  const api = new FakeOrchestratorApi();
  api.runsById["run-1"] = details;
  api.changes["run-1/review"] = changes;
  api.files["discovery/requirements.md"] = "# Requirements\nR1 Members can book a room.\nR2 Members can cancel.";
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
    expect(await screen.findByText("R1 Members can book a room.")).toBeTruthy();
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

  it("shows each file's change and line counts, and the diff by default", async () => {
    render();

    const file = await screen.findByLabelText("discovery/requirements.md");
    expect(within(file).getByText("modified")).toBeTruthy();
    expect(within(file).getByText("+2 −1")).toBeTruthy();
    const diff = await within(file).findByLabelText("diff of discovery/requirements.md");
    expect(within(diff).getByText("@@ -1,2 +1,3 @@")).toBeTruthy();
    expect(within(diff).getByText("R1 Members can book.").tagName).toBe("DEL");
    expect(within(diff).getByText("R2 Members can cancel.").tagName).toBe("INS");
    expect(within(diff).getByText("# Requirements").tagName).toBe("SPAN");
    expect(within(file).getByRole("button", { name: "Diff" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("switches a file to its whole text and back", async () => {
    render();
    const file = await screen.findByLabelText("discovery/requirements.md");

    await userEvent.click(within(file).getByRole("button", { name: "Whole file" }));

    expect(within(file).queryByLabelText("diff of discovery/requirements.md")).toBeNull();
    expect(await within(file).findByText(/R1 Members can book a room\. R2 Members can cancel\./)).toBeTruthy();

    await userEvent.click(within(file).getByRole("button", { name: "Diff" }));
    expect(within(file).getByLabelText("diff of discovery/requirements.md")).toBeTruthy();
  });

  it("lists a deleted file without a body or an Edit button", async () => {
    render(waitingRun(), [{ path: "kb/old-notes.md", change: "deleted", added: 0, removed: 3, diff: "@@ -1,3 +0,0 @@\n-a\n-b\n-c\n" }]);

    const file = await screen.findByLabelText("kb/old-notes.md");
    expect(within(file).getByText("deleted")).toBeTruthy();
    expect(within(file).getByText("−3")).toBeTruthy();
    expect(within(file).queryByLabelText("diff of kb/old-notes.md")).toBeNull();
    expect(within(file).queryByRole("button", { name: "Edit" })).toBeNull();
    expect(within(file).queryByRole("button", { name: "Whole file" })).toBeNull();
  });

  it("says why a file has no diff, and shows it whole", async () => {
    render(waitingRun(), [{ path: "discovery/requirements.md", change: "modified", added: 0, removed: 0, diff: null, reason: "no git" }]);

    const file = await screen.findByLabelText("discovery/requirements.md");
    expect(within(file).getByText("No diff: the project is not a git repository, so there is nothing to compare with.")).toBeTruthy();
    expect(await within(file).findByText(/R2 Members can cancel\./)).toBeTruthy();
    expect(within(file).queryByRole("button", { name: "Whole file" })).toBeNull();
  });

  it("says when a listed file wasn't changed", async () => {
    render(waitingRun(), [{ path: "discovery/requirements.md", change: "unchanged", added: 0, removed: 0, diff: "" }]);
    expect(await screen.findByText("No changes in this file.")).toBeTruthy();
  });

  it("says when nothing was changed before the gate", async () => {
    render(runDetails({ status: "waiting", gateId: "review", shows: [], state: runState({ steps: { elicit: record() } }) }), []);
    expect(await screen.findByText("No files were changed before this gate.")).toBeTruthy();
  });

  it("says when the changes can't be loaded", async () => {
    const api = new FakeOrchestratorApi();
    api.runsById["run-1"] = waitingRun();
    renderPage(<RunPage />, { path: "/runs/:runId", at: "/runs/run-1", api });
    expect(await screen.findByText('Couldn\'t load the changes: no gate "review" in run "run-1"')).toBeTruthy();
  });

  it("fetches the changes again when the gate waits after a reject", async () => {
    const api = render();
    await screen.findByLabelText("diff of discovery/requirements.md");
    api.changes["run-1/review"] = [{ path: "discovery/requirements.md", change: "modified", added: 1, removed: 0, diff: "@@ -3 +3,2 @@\n R2 Members can cancel.\n+R3 Members can swap.\n" }];

    act(() => {
      api.emit("run-1", 5, { type: "step-started", stepId: "elicit", attempt: 2 });
      api.emit("run-1", 6, { type: "step-finished", stepId: "elicit", record: record({ cursorRunIds: ["a1", "a2"] }) });
      api.emit("run-1", 7, { type: "gate-waiting", gateId: "review", shows: ["discovery/requirements.md"] });
      api.emit("run-1", 8, { type: "run-settled", outcome: waitingRun().outcome as RunOutcome });
    });

    expect(await screen.findByText("R3 Members can swap.")).toBeTruthy();
  });

  it("opens a gate's file in the editor", async () => {
    render();

    await userEvent.click(await screen.findByRole("button", { name: "edit discovery/requirements.md" }));

    expect(screen.getByTestId("location").textContent).toBe(`/files?path=${encodeURIComponent("discovery/requirements.md")}`);
  });

  it("says when a gate's file doesn't exist", async () => {
    const api = new FakeOrchestratorApi();
    api.runsById["run-1"] = waitingRun();
    api.changes["run-1/review"] = [{ path: "discovery/requirements.md", change: "created", added: 0, removed: 0, diff: null, reason: "no git" }];
    renderPage(<RunPage />, { path: "/runs/:runId", at: "/runs/run-1", api });
    expect(await screen.findByText("File not found.")).toBeTruthy();
  });
});

describe("RunPage while running", () => {
  it("shows the agent's live feed and a Cancel button under the running step", async () => {
    const api = render(runDetails(null, { busy: true }));
    await screen.findByText("BA discovery");

    act(() => {
      api.emit("run-1", 1, { type: "step-started", stepId: "elicit", attempt: 1 });
      api.emit("run-1", 2, { type: "agent-event", stepId: "elicit", event: { kind: "text", text: "Reading the brief" } });
    });

    const step = screen.getByLabelText("step elicit");
    expect(within(step).getByText("running")).toBeTruthy();
    expect(within(step).getByText(/Reading the brief/)).toBeTruthy();
    await userEvent.click(within(step).getByRole("button", { name: "Cancel this step" }));
    expect(api.calls).toContain("cancel run-1");
  });

  it("shows no Cancel button when nothing is running", async () => {
    render();
    await screen.findByText("BA discovery");
    expect(screen.queryByRole("button", { name: "Cancel this step" })).toBeNull();
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

  it("shows why a run failed, and retries it", async () => {
    const api = render(runDetails({ status: "failed", stepId: "elicit", state: runState({ steps: { elicit: record({ status: "failed", summary: "rate limited" }) } }) }));
    expect(await screen.findByText("Failed at elicit: rate limited")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(api.calls).toContain("retry run-1");
  });

  it("offers Retry only for a failed run", async () => {
    render();
    await screen.findByText("BA discovery");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("says so for an unknown run", async () => {
    renderPage(<RunPage />, { path: "/runs/:runId", at: "/runs/nope" });
    expect(await screen.findByText('No run "nope".')).toBeTruthy();
  });
});
