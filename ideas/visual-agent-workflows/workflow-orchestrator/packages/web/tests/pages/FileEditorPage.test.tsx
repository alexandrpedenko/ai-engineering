import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFileDraftStore } from "../../src/application/useFileDraftStore";
import { FileEditorPage } from "../../src/pages/FileEditorPage";
import { FakeOrchestratorApi } from "../support/FakeOrchestratorApi";
import { renderPage } from "../support/renderWithProviders";

// Monaco needs a real browser; a textarea stands in for the editor, with
// Ctrl+S calling onSave like the real one.
vi.mock("../../src/components/CodeEditor", () => ({
  CodeEditor: (props: { value: string; label: string; onChange: (value: string) => void; onSave: () => void }) => (
    <textarea
      aria-label={props.label}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.ctrlKey && event.key === "s") props.onSave();
      }}
    />
  ),
}));

const SKILL = ".cursor/skills/requirements-elicitation/SKILL.md";

beforeEach(() => {
  useFileDraftStore.setState({ drafts: {} });
});

function render(path = SKILL, api = new FakeOrchestratorApi()) {
  api.files[SKILL] ??= "# Requirements elicitation\n";
  renderPage(<FileEditorPage />, { path: "/files", at: `/files?path=${encodeURIComponent(path)}`, api });
  return api;
}

const editor = (path = SKILL) => screen.findByRole("textbox", { name: `Editor for ${path}` });

describe("FileEditorPage", () => {
  it("loads the file and says what it is and who uses it", async () => {
    render();

    expect(await editor()).toHaveProperty("value", "# Requirements elicitation\n");
    const about = screen.getByLabelText("about this file");
    expect(within(about).getByText(/skill "requirements-elicitation"/)).toBeTruthy();
    expect(within(about).getByRole("button", { name: "BA discovery" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
  });

  it("saves the edited text with the version it was opened at", async () => {
    const api = render();

    await userEvent.type(await editor(), "Mark each requirement with a priority.");
    expect(screen.getByText("● unsaved")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByText("● unsaved")).toBeNull());
    expect(api.calls).toEqual([`saveFile ${SKILL}`]);
    expect(api.files[SKILL]).toBe("# Requirements elicitation\nMark each requirement with a priority.");
  });

  it("saves with Ctrl+S from the editor", async () => {
    const api = render();
    const text = await editor();
    await userEvent.type(text, "x");

    fireEvent.keyDown(text, { key: "s", ctrlKey: true });

    await waitFor(() => expect(api.calls).toEqual([`saveFile ${SKILL}`]));
  });

  it("offers Reload or Overwrite when the file changed on disk, and Reload shows the disk version", async () => {
    const api = render();
    await userEvent.type(await editor(), "mine");
    api.files[SKILL] = "# Changed in the IDE\n";

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/changed on disk since you opened it/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));

    await waitFor(async () => expect(await editor()).toHaveProperty("value", "# Changed in the IDE\n"));
    expect(screen.queryByText("● unsaved")).toBeNull();
    expect(api.files[SKILL]).toBe("# Changed in the IDE\n");
  });

  it("overwrites the disk version when asked", async () => {
    const api = render();
    await userEvent.type(await editor(), "mine");
    api.files[SKILL] = "# Changed in the IDE\n";
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await userEvent.click(await screen.findByRole("button", { name: "Overwrite" }));

    await waitFor(() => expect(api.files[SKILL]).toBe("# Requirements elicitation\nmine"));
    expect(api.calls.at(-1)).toBe(`saveFile ${SKILL} (overwrite)`);
  });

  it("shows the registry's warnings for this file", async () => {
    const api = new FakeOrchestratorApi();
    api.registry = { ...api.registry, warnings: [{ path: SKILL, message: "missing description" }] };
    render(SKILL, api);

    expect(await screen.findByText("missing description")).toBeTruthy();
  });

  it("discards edits back to the loaded text", async () => {
    render();
    await userEvent.type(await editor(), "oops");

    await userEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(await editor()).toHaveProperty("value", "# Requirements elicitation\n");
  });

  it("shows the server's refusal for a file it can't open", async () => {
    render("nope.md");
    expect(await screen.findByText('no file "nope.md"')).toBeTruthy();
  });
});
