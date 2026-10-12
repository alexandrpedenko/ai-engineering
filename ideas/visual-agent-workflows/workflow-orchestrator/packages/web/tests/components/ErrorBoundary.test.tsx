import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../../src/components/ErrorBoundary";

let broken = true;
function Page() {
  if (broken) throw new Error("bad data");
  return <p>page drawn</p>;
}

afterEach(() => {
  vi.restoreAllMocks();
  broken = true;
});

describe("ErrorBoundary", () => {
  it("shows what went wrong instead of a blank page, and tries again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Page />
      </ErrorBoundary>,
    );

    expect(screen.getByText("This page failed to draw: bad data")).toBeTruthy();
    broken = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("page drawn")).toBeTruthy();
  });
});
