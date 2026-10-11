import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { NotFoundPage } from "../../src/pages/NotFoundPage";
import { renderPage } from "../support/renderWithProviders";

describe("NotFoundPage", () => {
  it("offers a way back to the project", async () => {
    renderPage(<NotFoundPage />, { path: "/nowhere", at: "/nowhere" });
    expect(screen.getByText("Page not found")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Go to the project" }));

    expect(screen.getByTestId("location").textContent).toBe("/project");
  });
});
