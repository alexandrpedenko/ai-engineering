import { fireEvent, screen, waitFor, waitForElementToBeRemoved, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useWorkflowDraftStore } from "../../src/application/useWorkflowDraftStore";
import { ApiError } from "../../src/domain/apiError";
import { WorkflowEditorPage } from "../../src/pages/WorkflowEditorPage";
import { FakeOrchestratorApi } from "../support/FakeOrchestratorApi";
import { renderPage } from "../support/renderWithProviders";

beforeEach(() => {
  useWorkflowDraftStore.setState({ drafts: {}, selected: {} });
});

function render(api = new FakeOrchestratorApi()) {
  renderPage(<WorkflowEditorPage />, { path: "/workflows/:id/edit", at: "/workflows/ba-discovery/edit", api });
  return api;
}

// A node on the canvas, by its label (a role query over React Flow's DOM is
// too slow for the default timeout).
const node = (id: string) => screen.findByLabelText(`step ${id}`);

async function choose(label: string, option: string) {
  await userEvent.click(screen.getByRole("combobox", { name: label }));
  await userEvent.click(await screen.findByRole("option", { name: new RegExp(`^${option}`) }));
}

// A click without the mousedown before it: React Flow selects on click, and its
// drag handler can't read jsdom's mousedown events.
async function selectStep(id: string) {
  fireEvent.click(await node(id));
  await screen.findByLabelText("inspector");
}

describe("WorkflowEditorPage", () => {
  it("draws the workflow's steps and says nothing is selected or wrong", async () => {
    render();

    expect(await node("elicit")).toBeTruthy();
    expect(within(await node("elicit")).getByText("business-analyst")).toBeTruthy();
    expect(within(await node("review")).getByText("◆ review")).toBeTruthy();
    expect(await node("design")).toBeTruthy();
    expect(screen.getByText("Select a step on the canvas to edit it.")).toBeTruthy();
    expect(within(screen.getByLabelText("problems")).getByText("None.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
  });

  it("adds a gate, connects it after design, sends its rejections to design, and saves", async () => {
    const api = render();
    await node("elicit");

    await userEvent.click(screen.getByRole("button", { name: "Add gate" }));
    expect(screen.getByRole("textbox", { name: "Id" })).toHaveProperty("value", "gate-1");
    expect(screen.getByText("● unsaved")).toBeTruthy();

    await selectStep("design");
    await choose("Next step", "gate-1");
    await selectStep("gate-1");
    await choose("Sends rejections to", "design");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.calls).toContain("save ba-discovery"));
    const saved = api.saved.at(-1);
    expect(saved?.steps.at(-1)).toMatchObject({ id: "gate-1", type: "gate", onReject: "design" });
    expect(saved?.edges).toContainEqual({ from: "design", to: "gate-1" });
    await waitFor(() => expect(screen.queryByText("● unsaved")).toBeNull());
  });

  it("picks an agent and skills from the project", async () => {
    const api = render();
    await selectStep("design");

    await choose("Agent", "business-analyst");
    await userEvent.click(screen.getByRole("combobox", { name: "Skills" }));
    await userEvent.click(await screen.findByRole("option", { name: /requirements-elicitation/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.saved).toHaveLength(1));
    expect(api.saved[0]?.steps[2]).toMatchObject({ agent: "business-analyst", skills: ["requirements-elicitation"] });
  });

  it("renames a step everywhere it is used, and refuses a taken id", async () => {
    render();
    await selectStep("review");

    const id = screen.getByRole("textbox", { name: "Id" });
    await userEvent.clear(id);
    await userEvent.type(id, "design{Enter}");
    expect(screen.getByText('"design" is already used by another step')).toBeTruthy();

    await userEvent.clear(id);
    await userEvent.type(id, "check{Enter}");
    expect(await node("check")).toBeTruthy();

    await selectStep("elicit");
    expect(screen.getByRole("combobox", { name: "Next step" }).textContent).toBe("check");
  });

  it("shows the server's problems with a draft on the node and in the list", async () => {
    const api = new FakeOrchestratorApi();
    api.checkProblems = [{ severity: "error", stepId: "elicit", message: 'unknown agent "ghost"' }];
    render(api);
    await selectStep("elicit");

    await userEvent.type(screen.getByRole("textbox", { name: "Label" }), "!");

    expect(await within(screen.getByLabelText("problems")).findByText('unknown agent "ghost"')).toBeTruthy();
    expect(await within(await node("elicit")).findByLabelText("has errors")).toBeTruthy();
    expect(within(await node("design")).queryByLabelText("has errors")).toBeNull();
  });

  it("discards a draft back to the saved workflow", async () => {
    render();
    await selectStep("elicit");
    await userEvent.type(screen.getByRole("textbox", { name: "Label" }), " now");
    expect(screen.getByRole("textbox", { name: "Label" })).toHaveProperty("value", "Write requirements now");

    await userEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(screen.getByRole("textbox", { name: "Label" })).toHaveProperty("value", "Write requirements");
    expect(screen.queryByText("● unsaved")).toBeNull();
  });

  it("removes a step from the inspector", async () => {
    render();
    await selectStep("design");

    await userEvent.click(screen.getByRole("button", { name: "Remove step" }));

    await waitFor(() => expect(screen.queryByLabelText("step design")).toBeNull());
    expect(screen.getByText("Select a step on the canvas to edit it.")).toBeTruthy();
  });

  it("asks before deleting, then deletes and leaves", async () => {
    const api = render();
    await node("elicit");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await waitForElementToBeRemoved(() => screen.queryByRole("dialog"));
    expect(api.calls).not.toContain("delete ba-discovery");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/project"));
    expect(api.calls).toContain("delete ba-discovery");
  });

  it("says when there is no such workflow", async () => {
    renderPage(<WorkflowEditorPage />, { path: "/workflows/:id/edit", at: "/workflows/nope/edit", api: new FakeOrchestratorApi() });
    expect(await screen.findByText('No workflow "nope".')).toBeTruthy();
  });

  it("adds an agent step and opens it in the inspector", async () => {
    render();
    await node("elicit");

    await userEvent.click(screen.getByRole("button", { name: "Add agent step" }));

    expect(await node("step-1")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Id" })).toHaveProperty("value", "step-1");
  });

  it("keeps edits made while a save was on its way", async () => {
    const api = render();
    let release: () => void = () => {};
    const original = api.saveWorkflow.bind(api);
    api.saveWorkflow = async (w) => {
      await new Promise<void>((resolve) => (release = resolve));
      return await original(w);
    };
    await selectStep("elicit");
    const label = screen.getByRole("textbox", { name: "Label" });
    await userEvent.type(label, " 1");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await userEvent.type(label, " 2");
    release();

    await waitFor(() => expect(api.saved).toHaveLength(1));
    expect(api.saved[0]?.steps[0]?.label).toBe("Write requirements 1");
    expect(screen.getByRole("textbox", { name: "Label" })).toHaveProperty("value", "Write requirements 1 2");
    expect(screen.getByText("● unsaved")).toBeTruthy();
  });

  it("says why a save failed and keeps the draft", async () => {
    const api = new FakeOrchestratorApi();
    api.failures.saveWorkflow = new ApiError(400, "not a valid workflow", [{ severity: "error", message: "steps.0.id: bad" }]);
    render(api);
    await selectStep("elicit");
    await userEvent.type(screen.getByRole("textbox", { name: "Label" }), "!");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/Not saved: not a valid workflow/)).toBeTruthy();
    expect(screen.getByText("steps.0.id: bad")).toBeTruthy();
    expect(screen.getByText("● unsaved")).toBeTruthy();
  });

  it("says when the draft couldn't be checked", async () => {
    const api = new FakeOrchestratorApi();
    api.failures.checkWorkflow = new Error("server down");
    render(api);
    await selectStep("elicit");

    await userEvent.type(screen.getByRole("textbox", { name: "Label" }), "!");

    expect(await screen.findByText(/Couldn't check the draft: server down/)).toBeTruthy();
  });

  it("says why a delete failed and stays", async () => {
    const api = new FakeOrchestratorApi();
    api.failures.deleteWorkflow = new Error("disk is read-only");
    render(api);
    await node("elicit");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await within(dialog).findByText("disk is read-only")).toBeTruthy();
    expect(screen.queryByTestId("location")).toBeNull();
  });

  it("edits the workflow's name, phase and inputs", async () => {
    const api = render();
    const fields = await screen.findByLabelText("workflow fields");

    await userEvent.clear(within(fields).getByRole("textbox", { name: "Name" }));
    await userEvent.type(within(fields).getByRole("textbox", { name: "Name" }), "BA two");
    await choose("Phase", "Delivery");
    await userEvent.click(within(fields).getByRole("button", { name: "Add input" }));
    await userEvent.type(within(fields).getAllByRole("textbox", { name: "Question" })[1]!, "Who is it for?");
    await userEvent.click(within(fields).getByRole("button", { name: "remove input focus" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.saved).toHaveLength(1));
    expect(api.saved[0]).toMatchObject({ name: "BA two", phase: "delivery", inputs: [{ id: "input-1", label: "Who is it for?" }] });
  });

  it("treats an id with only spaces added as unchanged", async () => {
    render();
    await selectStep("review");

    await userEvent.type(screen.getByRole("textbox", { name: "Id" }), " {Enter}");

    expect(screen.queryByText("● unsaved")).toBeNull();
  });

  it("keeps spaces typed into the model, trimming the ends when leaving the field", async () => {
    const api = render();
    await selectStep("elicit");
    const model = screen.getByRole("textbox", { name: "Model (optional)" });

    await userEvent.type(model, " my model ");
    expect(model).toHaveProperty("value", " my model ");
    await userEvent.tab();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.saved).toHaveLength(1));
    expect(api.saved[0]?.steps[0]).toMatchObject({ model: "my model" });
  });

  it("lets max revisions be cleared and retyped", async () => {
    const api = render();
    await selectStep("review");
    const max = screen.getByRole("spinbutton", { name: "Max revisions" });

    await userEvent.clear(max);
    await userEvent.type(max, "5");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.saved).toHaveLength(1));
    expect(api.saved[0]?.steps[1]).toMatchObject({ maxRevisions: 5 });
  });
});
